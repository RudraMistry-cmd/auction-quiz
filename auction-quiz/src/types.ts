/**
 * Shared TypeScript types for the auction-quiz system.
 * These types are shared between client and server.
 */

// Team representation
export interface Team {
  team_id: string;
  team_name: string;
  player1: string;
  player2: string;
  phone?: string;
  email: string;
  bid_coins: number;
  reward_points: number;
  created_at: Date;
}

// Auction state
export interface Auction {
  auction_id: string;
  start_bid: number;
  increment: number;
  duration: number; // seconds
  end_at: number; // Unix timestamp in ms
  status: 'active' | 'ended';
  current_bid: number;
  winning_team?: string;
  last_bid_seq: number;
  last_bid_team_id?: string;
  created_at: Date;
}

// Bid record
export interface Bid {
  bid_id: string;
  auction_id: string;
  team_id: string;
  seq_no: number;
  bid_amount: number;
  created_at: Date;
}

// Socket event names
export const enum ClientEvent {
  Join = 'client:join',
  PlaceBid = 'client:place_bid',
}

export const enum ServerEvent {
  Started = 'auction:started',
  BidUpdate = 'auction:bid_update',
  Timer = 'auction:timer',
  Ended = 'auction:ended',
  Scoreboard = 'auction:scoreboard',
}

// Rate limiting types
export interface RateLimitRecord {
  teamId: string;
  lastBidAt: number;
  count: number;
}

// API Request types
export interface JoinRequest {
  teamName: string;
  player1: string;
  player2: string;
  phone?: string;
  email: string;
}

export interface JoinResponse {
  teamId: string;
  sessionToken: string;
  auction: Auction;
}

export interface PlaceBidRequest {
  teamId: string;
  sessionToken: string;
  bidAmount: number;
}

export interface PlaceBidResponse {
  success: boolean;
  bid?: Bid;
  rejectionReason?: 'INSUFFICIENT_COINS' | 'RATE_LIMITED' | 'AUCTION_ENDED' | 'INVALID_BID';
}

export interface TimerUpdate {
  timeRemaining: number;
  currentBid: number;
  currentBidTeamId: string;
}

export interface AuctionEndResult {
  winnerTeamId: string;
  winningBid: number;
  auctionId: string;
}