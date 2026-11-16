import mongoose from 'mongoose';
import { env } from './config/env.js';
import { provider } from './config/chain.js';
import app from './app.js';
import { Nonce } from './models/Nonce.js';

// Pastikan RPC_URL menunjuk ke jaringan yang sama dengan CHAIN_ID,
// supaya role tidak dibaca dari kontrak di jaringan yang salah.
const { chainId } = await provider.getNetwork();
if (chainId !== BigInt(env.chainId)) {
  throw new Error(`RPC_URL berada di chain ${chainId}, padahal CHAIN_ID=${env.chainId}`);
}
if ((await provider.getCode(env.contractAddress)) === '0x') {
  throw new Error(`Tidak ada kontrak di CONTRACT_ADDRESS ${env.contractAddress}`);
}

mongoose.set('strictQuery', true);
await mongoose.connect(env.mongoUri);
console.log('MongoDB terhubung');
// Versi lama punya index unik di Nonce.address; syncIndexes menggantinya dengan index biasa.
await Nonce.syncIndexes();
app.listen(env.port, () => console.log(`Backend jalan di http://localhost:${env.port}`));
