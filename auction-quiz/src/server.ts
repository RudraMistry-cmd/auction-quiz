import express from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import Database from 'sqlite3';
import { Team, Auction, Bid } from './types';

// Type assertion for the sqlite3 Database type
const sqlite3 = require('sqlite3');

type Db = Database.Database;

export class AuctionServer {
  private app: express.Application;
  private httpServer: http.Server;
  private io: SocketIOServer;
  private db: Db;
  private rateLimitMap: Map<string, number> = new Map(); // teamId -> lastBidAt
  private currentAuction: Auction | null = null;
  private auctionEndTimeout: NodeJS.Timeout | null = null;

  constructor(dbPath: string, port: number = 3000) {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Database connection error:', err);
        process.exit(1);
      }
    });
    this.app = express();
    this.httpServer = http.createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.setupMiddleware();
    this.setupSocketHandlers();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    // Team registration endpoint
    this.app.post('/teams/register', async (req, res) => {
      try {
        const { teamName, player1, player2, phone, email } = req.body as JoinRequest;
        if (!teamName || !player1 || !player2 || !email) {
          return res.status(400).json({ error: 'Missing required fields: teamName, player1, player2, email' });
        }

        const { team, sessionToken } = await createTeam(this.db, teamName, player1, player2, phone, email);

        const auction = await getActiveAuctionWrapped(this.db);

        const response: JoinResponse = {
          teamId: team.team_id,
          sessionToken,
          auction
        };

        res.json(response);
      } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Failed to register team' });
      }
    });
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Handle client:join event
      socket.on(ClientEvent.Join, async (data: { sessionToken: string }, callback?: (resp: any) => void) => {
        try {
          const team = await validateSessionWrapped(this.db, data.sessionToken);

          if (!team) {
            socket.disconnect();
            return;
          }

          socket.data = {
            team,
            sessionToken: data.sessionToken
          };

          // Send current auction state
          if (this.currentAuction) {
            socket.emit(ServerEvent.Started, {
              auctionId: this.currentAuction.auction_id,
              startBid: this.currentAuction.start_bid,
              increment: this.currentAuction.increment,
              duration: this.currentAuction.duration,
              endAt: this.currentAuction.end_at,
              currentBid: this.currentAuction.current_bid,
              winningTeamId: this.currentAuction.winning_team,
              lastBidSeq: this.currentAuction.last_bid_seq
            });
          }

          // Emit timer update
          this.emitTimerToSocket(socket);

          // Emit scoreboard (all bids for this auction)
          const bids = await getBidsByAuctionWrapped(this.db, this.currentAuction?.auction_id || '');
          socket.emit(ServerEvent.Scoreboard, { bids });

          if (callback) {
            callback({ success: true, team: team.team_name });
          }
        } catch (err) {
          console.error('Join error:', err);
          if (callback) callback({ success: false, error: 'Failed to join' });
        }
      });

      // Handle client:place_bid event
      socket.on(ClientEvent.PlaceBid, async (data: { bidAmount: number }, callback?: (resp: PlaceBidResponse) => void) => {
        try {
          const team = socket.data?.team;
          if (!team) {
            if (callback) callback({ success: false, rejectionReason: 'TEAM_NOT_FOUND' });
            return;
          }

          // Rate limiting check (800ms per team)
          const now = Date.now();
          const lastBidAt = this.rateLimitMap.get(team.team_id) || 0;

          if (now - lastBidAt < 800) {
            if (callback) callback({ success: false, rejectionReason: 'RATE_LIMITED' });
            return;
          }

          // Compute next bid amount from current auction state
          const nextBid = this.computeNextBid();

          // Validate bid amount - must be at least the next bid
          if (data.bidAmount < nextBid) {
            if (callback) callback({
              success: false,
              rejectionReason: 'INSUFFICIENT_COINS'
            });
            return;
          }

          // Validate: team has enough coins for the bid
          const result = await acceptBidWrapped(this.db, this.currentAuction?.auction_id || '', team.team_id, data.bidAmount, this.currentAuction?.last_bid_seq || 0);

          if (result.rejectionReason) {
            if (callback) callback({ success: false, rejectionReason: result.rejectionReason });
            return;
          }

          const { bid, updatedAuction } = result;

          // Update current auction state in memory
          this.currentAuction = updatedAuction;

          // Broadcast bid update to all connected clients
          this.io.emit(ServerEvent.BidUpdate, {
            bid,
            auction: updatedAuction
          });

          // Update rate limit
          this.rateLimitMap.set(team.team_id, now);

          // Emit timer update to the bidding client
          this.emitTimerToSocket(socket);

          if (callback) {
            callback({ success: true, bid, auction: updatedAuction });
          }
        } catch (err) {
          console.error('Place bid error:', err);
          if (callback) callback({ success: false, rejectionReason: 'INTERNAL_ERROR' });
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        const teamId = (socket.data as { team?: Team })?.team?.team_id;
        if (teamId) {
          this.rateLimitMap.delete(teamId);
        }
      });
    });
  }

  private computeNextBid(): number {
    if (!this.currentAuction) return 50; // default start bid
    return this.currentAuction.current_bid + this.currentAuction.increment;
  }

  private emitTimerToSocket(socket: Socket): void {
    if (!this.currentAuction) return;

    const timeRemaining = Math.max(0, Math.ceil((this.currentAuction.end_at - Date.now()) / 1000));

    socket.emit('auction:timer', {
      timeRemaining,
      currentBid: this.currentAuction.current_bid,
      currentBidTeamId: this.currentAuction.last_bid_team_id
    });
  }

  start(): void {
    this.httpServer.listen(port, () => {
      console.log(`Auction server listening on port ${port}`);
      // Initialize current auction from DB and start timer
      this.initAuction().then(() => {
        this.startTimer();
      });
    });
  }

  private async initAuction(): Promise<void> {
    const auction = await getActiveAuctionWrapped(this.db);
    if (auction) {
      this.currentAuction = auction;
    } else {
      // Create a default auction
      const newAuction = await createAuctionWrapped(this.db, 'auc_1', 50, 10, 60);
      this.currentAuction = newAuction;
    }
  }

  private startTimer(): void {
    // Clear any existing timeout
    if (this.auctionEndTimeout) {
      clearTimeout(this.auctionEndTimeout);
      this.auctionEndTimeout = null;
    }

    // Set interval to emit timer every second
    const timerInterval = setInterval(() => {
      if (!this.currentAuction) {
        clearInterval(timerInterval);
        return;
      }

      const timeRemaining = Math.max(0, Math.ceil((this.currentAuction.end_at - Date.now()) / 1000));

      this.io.emit('auction:timer', {
        timeRemaining,
        currentBid: this.currentAuction.current_bid,
        currentBidTeamId: this.currentAuction.last_bid_team_id
      });

      // Check if auction duration has expired
      if (Date.now() >= this.currentAuction.end_at) {
        clearInterval(timerInterval);
        this.endAuctionAuthoritative();
      }
    }, 1000);
  }

  private async endAuctionAuthoritative(): Promise<void> {
    if (!this.currentAuction) return;

    const result = await endAuctionWrapped(this.db, this.currentAuction.auction_id);

    this.io.emit('auction:ended', {
      auctionId: this.currentAuction.auction_id,
      winnerTeamId: result.winnerTeamId,
      winningBid: result.winningBid
    });

    this.currentAuction = null;
  }
}

// Wrapped async DB functions to avoid repetitive try/catch
async function getActiveAuctionWrapped(db: Db): Promise<Auction | undefined> {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM auctions WHERE status = ? LIMIT 1',
      ['active'],
      (err, row) => {
        if (err) reject(err);
        else if (row === undefined) resolve(undefined);
        else {
          const auction: Auction = {
            auction_id: row.auction_id,
            start_bid: row.start_bid,
            increment: row.increment,
            duration: row.duration,
            end_at: row.end_at,
            status: row.status as 'active' | 'ended',
            current_bid: row.current_bid,
            winning_team: row.winning_team,
            last_bid_seq: row.last_bid_seq,
            last_bid_team_id: row.last_bid_team_id,
            created_at: new Date(row.created_at),
          };
          resolve(auction);
        }
      }
    );
  });
}

async function validateSessionWrapped(db: Db, sessionToken: string): Promise<Team | null> {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT t.* FROM teams t JOIN sessions s ON t.team_id = s.team_id WHERE s.session_token = ?',
      [sessionToken],
      (err, row) => {
        if (err) reject(err);
        else if (row === undefined) resolve(null);
        else {
          const team: Team = {
            team_id: row.team_id,
            team_name: row.team_name,
            player1: row.player1,
            player2: row.player2,
            phone: row.phone,
            email: row.email,
            bid_coins: row.bid_coins,
            reward_points: row.reward_points,
            created_at: new Date(row.created_at),
          };
          resolve(team);
        }
      }
    );
  });
}

async function createTeam(db: Database.Database, teamName: string, player1: string, player2: string, phone: string | undefined, email: string): Promise<{ team: Team; sessionToken: string }> {
  const teamId = crypto.randomUUID();
  const sessionToken = crypto.randomUUID();
  const now = new Date().toISOString();

  await new Promise<void>((resolve, reject) => {
    db.run(
      'INSERT INTO teams (team_id, team_name, player1, player2, phone, email, bid_coins, reward_points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [teamId, teamName, player1, player2, phone, email, 1000, 0, now],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  await new Promise<void>((resolve, reject) => {
    db.run(
      'INSERT INTO sessions (session_token, team_id, created_at) VALUES (?, ?, ?)',
      [sessionToken, teamId, now],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  const team: Team = {
    team_id: teamId,
    team_name: teamName,
    player1,
    player2,
    phone,
    email,
    bid_coins: 1000,
    reward_points: 0,
    created_at: new Date(),
  };

  return { team, sessionToken };
}

async function acceptBidWrapped(db: Db, auctionId: string, teamId: string, bidAmount: number, currentSeqNo: number): Promise<{ bid: Bid; updatedAuction: Auction } | { rejectionReason: string }> {
  // First, check if team has enough coins
  const team = await getTeamWrapped(db, teamId);
  if (!team) {
    return { rejectionReason: 'TEAM_NOT_FOUND' };
  }

  if (team.bid_coins < bidAmount) {
    return { rejectionReason: 'INSUFFICIENT_COINS' };
  }

  // Check if auction is still active
  const auction = await getActiveAuctionWrapped(db);
  if (!auction || auction.auction_id !== auctionId) {
    return { rejectionReason: 'AUCTION_NOT_ACTIVE' };
  }

  if (auction.status === 'ended') {
    return { rejectionReason: 'AUCTION_ENDED' };
  }

  // Accept the bid - create new bid record
  const bidId = crypto.randomUUID();
  const seqNo = currentSeqNo + 1;
  const now = new Date().toISOString();

  await new Promise<void>((resolve, reject) => {
    db.run(
      'INSERT INTO bids (bid_id, auction_id, team_id, seq_no, bid_amount, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [bidId, auctionId, teamId, seqNo, bidAmount, now],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  // Update team's bid coins
  const newBidCoins = team.bid_coins - bidAmount;

  await new Promise<void>((resolve, reject) => {
    db.run(
      'UPDATE teams SET bid_coins = ? WHERE team_id = ?',
      [newBidCoins, teamId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  // Update auction state
  const updatedCurrentBid = bidAmount;
  const updatedWinningTeam = teamId;
  const updatedLastBidSeq = seqNo;
  const updatedLastBidTeamId = teamId;

  await new Promise<void>((resolve, reject) => {
    db.run(
      'UPDATE auctions SET current_bid = ?, winning_team = ?, last_bid_seq = ?, last_bid_team_id = ? WHERE auction_id = ?',
      [updatedCurrentBid, updatedWinningTeam, updatedLastBidSeq, updatedLastBidTeamId, auctionId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  const bid: Bid = {
    bid_id: bidId,
    auction_id: auctionId,
    team_id: teamId,
    seq_no: seqNo,
    bid_amount: bidAmount,
    created_at: new Date(),
  };

  const updatedAuction: Auction = {
    auction_id: auction.auction_id,
    start_bid: auction.start_bid,
    increment: auction.increment,
    duration: auction.duration,
    end_at: auction.end_at,
    status: auction.status,
    current_bid: updatedCurrentBid,
    winning_team: updatedWinningTeam,
    last_bid_seq: updatedLastBidSeq,
    last_bid_team_id: updatedLastBidTeamId,
    created_at: auction.created_at,
  };

  return { bid, updatedAuction };
}

async function getTeamWrapped(db: Db, teamId: string): Promise<Team | undefined> {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM teams WHERE team_id = ?', [teamId], (err, row) => {
      if (err) reject(err);
      else if (row === undefined) resolve(undefined);
      else {
        const team: Team = {
          team_id: row.team_id,
          team_name: row.team_name,
          player1: row.player1,
          player2: row.player2,
          phone: row.phone,
          email: row.email,
          bid_coins: row.bid_coins,
          reward_points: row.reward_points,
          created_at: new Date(row.created_at),
        };
        resolve(team);
      }
    });
  });
}

async function getBidsByAuctionWrapped(db: Db, auctionId: string): Promise<Bid[]> {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM bids WHERE auction_id = ? ORDER BY seq_no ASC',
      [auctionId],
      (err, rows) => {
        if (err) reject(err);
        else {
          const bids: Bid[] = rows.map((row) => ({
            bid_id: row.bid_id,
            auction_id: row.auction_id,
            team_id: row.team_id,
            seq_no: row.seq_no,
            bid_amount: row.bid_amount,
            created_at: new Date(row.created_at),
          }));
          resolve(bids);
        }
      }
    );
  });
}

async function endAuctionWrapped(db: Db, auctionId: string): Promise<AuctionEndResult> {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM auctions WHERE auction_id = ?',
      [auctionId],
      (err, row) => {
        if (err) reject(err);
        else if (!row) reject(new Error('Auction not found'));
        else {
          let winningTeamId = row.winning_team;
          let winningBid = row.current_bid;

          if (!winningTeamId) {
            winningBid = row.start_bid;
            winningTeamId = 'no-bids';
          }

          const now = new Date().toISOString();

          db.run(
            'UPDATE auctions SET status = ?, end_at = ?, winning_team = ?, current_bid = ? WHERE auction_id = ?',
            ['ended', now, winningTeamId, winningBid, auctionId],
            (err) => {
              if (err) reject(err);
              else {
                resolve({
                  winnerTeamId: winningTeamId,
                  winningBid: winningBid,
                  auctionId: auctionId,
                });
              }
            }
          );
        }
      }
    );
  });
}

// Type imports from the types file
import { JoinRequest, JoinResponse, PlaceBidRequest, PlaceBidResponse } from './types';

const PORT = 3000;
const server = new AuctionServer(':memory:', PORT);

server.start();