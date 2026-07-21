#!/usr/bin/env node
'use strict';

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

const FRAMES_DIR = process.env.FRAMES_DIR || path.join(__dirname, '..', 'frames');
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, '..', 'auth_info');

// Varredura empírica contra o servidor real do WhatsApp (ver FINDINGS.md):
// 3s, 6s e 7s falham com "rate-overlimit" depois de poucas trocas (6-44s).
// 8s, 9s e 10s ficaram limpos em testes de ~90-150s sem nenhuma falha.
// 8s é o mais rápido confirmado seguro - mas está logo acima da fronteira
// de falha (7s), então tem menos margem que 10s pra rodar dias sem parar.
// Se algum dia aparecer "rate-overlimit" nos logs de produção, suba esse
// valor de volta pra 10s (ou pelo menos 9s) antes de qualquer outra coisa.
// NÃO reintroduza modo rajada (disparar rápido + cooldown) - já testado e
// descartado, ver FINDINGS.md.
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '8000', 10);

function loadFrames() {
  if (!fs.existsSync(FRAMES_DIR)) return [];
  return fs.readdirSync(FRAMES_DIR)
    .filter(f => f.endsWith('.png'))
    .sort()
    .map(f => path.join(FRAMES_DIR, f));
}

async function main() {
  const frames = loadFrames();
  if (frames.length === 0) {
    console.error(`Nenhum frame em ${FRAMES_DIR}/. Rode antes: npm run extract`);
    process.exit(1);
  }
  console.log(`${frames.length} frames carregados. Trocando a cada ${INTERVAL_MS / 1000}s.`);

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  let loopStarted = false;
  let stopped = false;

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nEscaneie o QR code no WhatsApp (Aparelhos conectados > Conectar um aparelho):\n');
      qrcode.generate(qr, { small: true });
      const qrPath = path.join(__dirname, '..', 'qr.png');
      QRCode.toFile(qrPath, qr, { width: 512 })
        .then(() => console.log(`QR salvo em ${qrPath}`))
        .catch((e) => console.error('Falha ao salvar QR como imagem:', e));
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão fechada.', statusCode, '— reconectando:', shouldReconnect);
      if (shouldReconnect && !stopped) {
        main().catch((e) => console.error('Falha ao reconectar:', e));
      }
    } else if (connection === 'open') {
      console.log('Conectado ao WhatsApp.');
      if (!loopStarted) {
        loopStarted = true;
        animateLoop(sock, frames).catch((e) => console.error('Loop de animação caiu:', e));
      }
    }
  });

  process.on('SIGINT', () => {
    console.log('\nParando...');
    stopped = true;
    process.exit(0);
  });
}

async function animateLoop(sock, frames) {
  const jid = sock.user.id;
  let i = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const frame = frames[i % frames.length];
    try {
      await sock.updateProfilePicture(jid, { url: frame });
      console.log(`[${new Date().toLocaleTimeString()}] foto atualizada -> ${path.basename(frame)}`);
    } catch (err) {
      // WhatsApp rate-limita troca de foto de perfil. Se cair aqui, espera mais
      // um ciclo em vez de martelar - evita escalar a punição (ver comentário no topo).
      console.error(`Falha ao trocar foto (seguindo com backoff): ${err?.message || err}`);
      await sleep(INTERVAL_MS * 2);
    }
    i++;
    await sleep(INTERVAL_MS);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
