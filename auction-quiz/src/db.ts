import Database from 'sqlite3';
import { Team, Auction, Bid } from './types';

// Open database and initialize schema
export async function initDb(dbPath: string = ':memory:'): Promise<Database.Database> {
  const db = new Database.Database(dbPath, (err) => {
    if (err) {
      console.error('Database initialization error:', err);
      process.exit(1);
    }
  });

  // Configure SQLite pragmas for performance and safety
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);

  // Create tables
  await new Promise<void>((resolve, reject) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        team_id TEXT PRIMARY KEY,
        team_name TEXT NOT NULL,
        player1 TEXT NOT NULL,
        player2 TEXT NOT NULL,
        phone TEXT,
        email TEXT NOT NULL,
        bid_coins INTEGER DEFAULT 1000,
        reward_points INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      CREATE TABLE IF NOT EXISTS sessions (
        session_token TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(team_id)
      );
      
      CREATE TABLE IF NOT EXISTS auctions (
        auction_id TEXT PRIMARY KEY,
        start_bid INTEGER DEFAULT 50,
        increment INTEGER DEFAULT 10,
        duration INTEGER DEFAULT 60,
        end_at INTEGER NOT NULL,
        status TEXT DEFAULT 'active',
        current_bid INTEGER DEFAULT 50,
        winning_team TEXT,
        last_bid_seq INTEGER DEFAULT 0,
        last_bid_team_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      CREATE TABLE IF NOT EXISTS bids (
        bid_id TEXT PRIMARY KEY,
        auction_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        seq_no INTEGER NOT NULL,
        bid_amount INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (auction_id) REFERENCES auctions(auction_id),
        FOREIGN KEY (team_id) REFERENCES teams(team_id)
      );
    `, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

  // Initialize a default auction if none exists
  await new Promise<void>((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM auctions', [], (err, row) => {
      if (err) reject(err);
      else if (row.count === 0) {
        const now = Date.now();
        const endAt = now + 60 * 1000; // 60 seconds from now
        db.run(
          'INSERT INTO auctions (auction_id, start_bid, increment, duration, end_at, status, current_bid, last_bid_seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          ['auc_1', 50, 10, 60, endAt, 'active', 50, 0],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      } else {
        resolve();
      }
    });
  });

  console.log('Database initialized successfully');
  return db;
}

// Team operations
export async function getTeam(db: Database.Database, teamId: string): Promise<Team | undefined> {
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

export async function createTeam(
  db: Database.Database,
  teamName: string,
  player1: string,
  player2: string,
  phone: string | undefined,
  email: string
): Promise<{ team: Team; sessionToken: string }> {
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

export async function validateSession(db: Database.Database, sessionToken: string): Promise<Team | null> {
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

// Auction operations
export async function getActiveAuction(db: Database.Database): Promise<Auction | undefined> {
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

export async function createAuction(
  db: Database.Database,
  auctionId: string,
  startBid: number,
  increment: number,
  duration: number
): Promise<Auction> {
  const now = Date.now();
  const endAt = now + duration * 1000;

  await new Promise<void>((resolve, reject) => {
    db.run(
      'INSERT INTO auctions (auction_id, start_bid, increment, duration, end_at, status, current_bid, last_bid_seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [auctionId, startBid, increment, duration, endAt, 'active', startBid, 0],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  const auction: Auction = {
    auction_id: auctionId,
    start_bid: startBid,
    increment,
    duration,
    end_at: endAt,
    status: 'active',
    current_bid: startBid,
    winning_team: undefined,
    last_bid_seq: 0,
    last_bid_team_id: undefined,
    created_at: new Date(),
  };

  return auction;
}

export async function acceptBid(
  db: Database.Database,
  auctionId: string,
  teamId: string,
  bidAmount: number,
  currentSeqNo: number
): Promise<{ bid: Bid; updatedAuction: Auction } | { rejectionReason: string }> {
  // First, check if team has enough coins
  const team = await getTeam(db, teamId);
  if (!team) {
    return { rejectionReason: 'TEAM_NOT_FOUND' };
  }

  if (team.bid_coins < bidAmount) {
    return { rejectionReason: 'INSUFFICIENT_COINS' };
  }

  // Check if auction is still active
  const auction = await getActiveAuction(db);
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

export async function endAuction(db: Database.Database, auctionId: string): Promise<AuctionEndResult> {
  // Get the final auction state with the winning bid
  const auction = await getActiveAuction(db);
  if (!auction || auction.auction_id !== auctionId) {
    throw new Error('Auction not found or not active');
  }

  // Auction is already ended or determine winner
  let winningTeamId = auction.winning_team;
  let winningBid = auction.current_bid;

  if (!winningTeamId) {
    // No bids were placed - return the start bid
    winningBid = auction.start_bid;
    // Find a team to award - in case of no bids, we award to... let's say the first team that joined
    // For now, we'll return a special result
    winningTeamId = 'no-bids';
  }

  // Update auction status to ended
  const now = new Date().toISOString();

  await new Promise<void>((resolve, reject) => {
    db.run(
      'UPDATE auctions SET status = ?, end_at = ?, winning_team = ?, current_bid = ? WHERE auction_id = ?',
      ['ended', now, winningTeamId, winningBid, auctionId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  return {
    winnerTeamId: winningTeamId,
    winningBid: winningBid,
    auctionId: auctionId,
  };
}

// Bid operations
export async function getBidsByAuction(db: Database.Database, auctionId: string): Promise<Bid[]> {
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