// Tes login wallet + keamanan dasar tanpa frontend. Jalankan saat server sedang hidup:
//   npm run test:login
import { Wallet } from 'ethers';

const BASE = process.env.BASE_URL || 'http://localhost:4000';
const json = { 'Content-Type': 'application/json' };
const wallet = Wallet.createRandom();
let failed = 0;
const check = (label, ok, info = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`);
};
console.log('Wallet tes:', wallet.address);

const getNonce = async (address) => (await fetch(`${BASE}/auth/nonce?address=${address}`)).json();
const verify = (body) => fetch(`${BASE}/auth/verify`, { method: 'POST', headers: json, body: JSON.stringify(body) });

// 1. minta nonce, lalu penyerang meminta nonce untuk alamat yang sama (tidak boleh membatalkan nonce korban)
const { nonce, message } = await getNonce(wallet.address);
await getNonce(wallet.address);

// 2. tanda tangan (di aplikasi nyata dilakukan MetaMask)
const signature = await wallet.signMessage(message);

// 3. verifikasi -> JWT
const login = await verify({ address: wallet.address, nonce, signature });
const { token } = await login.json();
check('Login (nonce korban tidak bisa ditimpa)', login.status === 200, login.status);

const auth = { ...json, Authorization: `Bearer ${token}` };

// 4. CRUD profil
const put = await fetch(`${BASE}/users/me`, { method: 'PUT', headers: auth, body: JSON.stringify({ name: 'Bonzaa' }) });
check('PUT /users/me', put.status === 200, put.status);
const get = await fetch(`${BASE}/users/me`, { headers: auth });
check('GET /users/me', get.status === 200 && (await get.json()).name === 'Bonzaa', get.status);

// 5. role dari smart contract
const me = await fetch(`${BASE}/auth/me`, { headers: auth });
check('GET /auth/me', me.status === 200, JSON.stringify((await me.clone().json()).roles));

// 6. replay signature harus ditolak
const replay = await verify({ address: wallet.address, nonce, signature });
check('Replay signature ditolak', replay.status === 401, replay.status);

// 7. tanda tangan wallet lain untuk alamat korban harus ditolak
const other = Wallet.createRandom();
const n2 = await getNonce(wallet.address);
const forged = await verify({ address: wallet.address, nonce: n2.nonce, signature: await other.signMessage(n2.message) });
check('Tanda tangan palsu ditolak', forged.status === 401, forged.status);

// 8. mass assignment harus ditolak
const mass = await fetch(`${BASE}/users/me`, { method: 'PUT', headers: auth, body: JSON.stringify({ name: 'x', address: '0xabc' }) });
check('Field ekstra ditolak', mass.status === 400, mass.status);

// 9. avatarUrl javascript: harus ditolak (stored XSS)
const xss = await fetch(`${BASE}/users/me`, { method: 'PUT', headers: auth, body: JSON.stringify({ name: 'x', avatarUrl: 'javascript:alert(document.cookie)' }) });
check('avatarUrl javascript: ditolak', xss.status === 400, xss.status);

// 10. NoSQL injection lewat query harus ditolak
const nosql = await fetch(`${BASE}/organizer/applications?status[$ne]=x`, { headers: auth });
check('Query operator / non-admin ditolak', nosql.status === 400 || nosql.status === 403, nosql.status);

// 11. JWT dengan alg none harus ditolak
const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: wallet.address.toLowerCase() })).toString('base64url')}.`;
const noneRes = await fetch(`${BASE}/users/me`, { headers: { Authorization: `Bearer ${none}` } });
check('JWT alg=none ditolak', noneRes.status === 401, noneRes.status);

// 12. non-EO tidak bisa ubah detail event / upload
const ev = await fetch(`${BASE}/events/1/details`, { method: 'PUT', headers: auth, body: JSON.stringify({ description: 'x', location: 'y' }) });
check('Non-pemilik tidak bisa ubah detail event', ev.status === 403 || ev.status === 404, ev.status);

// 13. hapus profil, lalu PUT harus 404 (bukan 200 null)
const del = await fetch(`${BASE}/users/me`, { method: 'DELETE', headers: auth });
check('DELETE /users/me', del.status === 204, del.status);
const afterDel = await fetch(`${BASE}/users/me`, { method: 'PUT', headers: auth, body: JSON.stringify({ name: 'x' }) });
check('PUT setelah dihapus -> 404', afterDel.status === 404, afterDel.status);

console.log(failed ? `\n${failed} cek GAGAL` : '\nSemua cek lulus');
process.exitCode = failed ? 1 : 0;
