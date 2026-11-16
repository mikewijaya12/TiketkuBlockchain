import { JsonRpcSigner, TypedDataDomain, getAddress, isHexString } from 'ethers';
import { CHAIN_ID, CONTRACT_ADDRESS } from './config';

export const QR_TTL_SECONDS = 5 * 60;

export const checkInDomain = (): TypedDataDomain => ({
  name: 'TiketKu',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: CONTRACT_ADDRESS,
});

export const CHECKIN_TYPES = {
  CheckIn: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'holder', type: 'address' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export interface QrPayload { v: 1; c: number; t: number; d: number; s: string }

// Pemilik tiket menandatangani data EIP-712; hasilnya dijadikan isi QR.
export async function signCheckIn(signer: JsonRpcSigner, tokenId: number) {
  const holder = getAddress(await signer.getAddress());
  const deadline = Math.floor(Date.now() / 1000) + QR_TTL_SECONDS;
  const s = await signer.signTypedData(checkInDomain(), CHECKIN_TYPES, { tokenId, holder, deadline });
  const payload: QrPayload = { v: 1, c: CHAIN_ID, t: tokenId, d: deadline, s };
  return { payload, text: JSON.stringify(payload) };
}

// Validasi ketat isi QR yang dipindai (input tidak tepercaya).
export function parseQr(text: string): QrPayload | null {
  if (text.length > 400) return null;
  try {
    const o = JSON.parse(text);
    if (!o || typeof o !== 'object') return null;
    const ok =
      o.v === 1 &&
      o.c === CHAIN_ID &&
      Number.isSafeInteger(o.t) && o.t > 0 &&
      Number.isSafeInteger(o.d) && o.d > 0 &&
      typeof o.s === 'string' && isHexString(o.s) && o.s.length >= 132 && o.s.length <= 300;
    return ok ? { v: 1, c: o.c, t: o.t, d: o.d, s: o.s } : null;
  } catch {
    return null;
  }
}
