#!/usr/bin/env node
'use strict';

// EXPERIMENTO: o rate limit de troca de foto de perfil é por-conta ou por-dispositivo?
//
// Abre DUAS conexões (dois aparelhos linkados) na MESMA conta:
//   - Device A: reusa auth_info (já linkado, sem QR)
//   - Device B: auth_info_2 (novo QR, escaneie uma vez)
//
// Os dois disparam updateProfilePicture em cadência de 8s, defasados 4s entre si,
// dando ~4s efetivos. Se o balde de rate limit for POR DISPOSITIVO, os dois ficam
// limpos e conseguimos 2x. Se for POR CONTA (hipótese mais provável), aparece
// "rate-overlimit" rápido - e aí o teste PARA sozinho no primeiro erro.

const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const FRAMES_DIR = path.join(__dirname, '..', 'frames');
const AUTH_A = path.join(__dirname, '..', 'auth_info');    // já linkado
const AUTH_B = path.join(__dirname, '..', 'auth_info_2');  // novo QR
const CADENCE_MS = 8000;   // cada device respeita 8s
const OFFSET_MS = 4000;    // B começa 4s depois de A -> combinado ~4s

let stop = false;

function loadFrames() {
  return fs.readdirSync(FRAMES_DIR).filter(f => f.endsWith('.png')).sort()
    .map(f => path.join(FRAMES_DIR, f));
}

async function connect(label, authDir, qrFile) {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }), printQRInTerminal: false });
  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve) => {
    sock.ev.on('connection.update', (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        console.log(`\n[${label}] escaneie este QR (aparelho ${label}):\n`);
        qrcode.generate(qr, { small: true });
        QRCode.toFile(path.join(__dirname, '..', qrFile), qr, { width: 512 })
          .then(() => console.log(`[${label}] QR salvo em ${qrFile}`)).catch(() => {});
      }
      if (connection === 'open') {
        console.log(`[${label}] conectado.`);
        resolve(sock);
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) console.log(`[${label}] deslogado.`);
      }
    });
  });
}

async function fireLoop(sock, label, frames, startDelay) {
  await sleep(startDelay);
  const jid = sock.user.id;
  let i = 0;
  while (!stop) {
    try {
      await sock.updateProfilePicture(jid, { url: frames[i % frames.length] });
      console.log(`[${new Date().toLocaleTimeString()}] [${label}] ok -> ${path.basename(frames[i % frames.length])}`);
      i++;
    } catch (err) {
      const msg = String(err?.message || err);
      console.error(`[${new Date().toLocaleTimeString()}] [${label}] FALHOU: ${msg}`);
      if (/overlimit|rate/i.test(msg)) {
        console.error(`\n>>> VEREDITO: rate limit é POR CONTA (dois aparelhos dividem o mesmo balde). Multi-device NÃO ajuda. Parando teste.\n`);
        stop = true;
        return;
      }
      await sleep(3000);
    }
    await sleep(CADENCE_MS);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const frames = loadFrames();
  console.log(`${frames.length} frames. Testando 2 aparelhos, cadência ${CADENCE_MS/1000}s cada, defasagem ${OFFSET_MS/1000}s (efetivo ~${(CADENCE_MS - OFFSET_MS)/1000}s).`);

  const sockA = await connect('A', AUTH_A, 'qr.png');
  const sockB = await connect('B', AUTH_B, 'qr2.png');

  console.log('\nAmbos conectados. Iniciando disparo defasado. Ctrl+C ou primeiro rate-overlimit encerra.\n');
  await Promise.all([
    fireLoop(sockA, 'A', frames, 0),
    fireLoop(sockB, 'B', frames, OFFSET_MS),
  ]);
  console.log('Teste encerrado.');
  process.exit(0);
})();

process.on('SIGINT', () => { stop = true; setTimeout(() => process.exit(0), 500); });
