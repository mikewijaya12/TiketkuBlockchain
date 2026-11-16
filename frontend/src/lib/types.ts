export interface OnchainEvent {
  id: number;
  name: string;
  organizer: string;
  price: bigint;
  maxSupply: bigint;
  sold: bigint;
  maxResaleBps: number;
  eventDate: bigint;
  cancelled: boolean;
  maxPerWallet: bigint;
}

export interface EventDetail {
  description: string;
  location: string;
  posterUrl?: string;
}

export interface MyTicket {
  tokenId: number;
  eventId: number;
  used: boolean;
  listingPrice: bigint; // 0 = tidak dijual
  event?: OnchainEvent;
}

export interface Roles {
  admin: boolean;
  organizer: boolean;
  gate: boolean;
  buyer: boolean;
}
