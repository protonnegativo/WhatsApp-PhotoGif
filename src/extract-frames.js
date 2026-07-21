#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const GIF_PATH = process.env.GIF_PATH || path.join(__dirname, '..', 'assets', 'avatar.gif');
const FRAMES_DIR = process.env.FRAMES_DIR || path.join(__dirname, '..', 'frames');
const MAX_FRAMES = parseInt(process.env.MAX_FRAMES || '16', 10);
const SIZE = parseInt(process.env.SIZE || '640', 10);

if (!fs.existsSync(GIF_PATH)) {
  console.error(`GIF não encontrado em ${GIF_PATH}`);
  console.error('Coloque seu arquivo em assets/avatar.gif (ou aponte GIF_PATH=/caminho/seu.gif).');
  process.exit(1);
}

fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });

// Descobre quantos frames o GIF tem de verdade, pra escolher um fps de amostragem
// que não passe de MAX_FRAMES (WhatsApp rate-limita troca de foto de perfil,
// então poucos frames bem espaçados > GIF inteiro frame a frame).
const probe = execFileSync('ffprobe', [
  '-v', 'error',
  '-select_streams', 'v:0',
  '-show_entries', 'stream=nb_read_frames',
  '-count_frames',
  '-of', 'csv=p=0',
  GIF_PATH,
]).toString().trim();

const totalFrames = parseInt(probe, 10) || MAX_FRAMES;
const step = Math.max(1, Math.floor(totalFrames / MAX_FRAMES));

console.log(`GIF tem ~${totalFrames} frames. Extraindo 1 a cada ${step}, até ${MAX_FRAMES} frames, ${SIZE}x${SIZE}.`);

execFileSync('ffmpeg', [
  '-y',
  '-i', GIF_PATH,
  '-vf', `select='not(mod(n\\,${step}))',scale=${SIZE}:${SIZE}:force_original_aspect_ratio=increase,crop=${SIZE}:${SIZE}`,
  '-vsync', '0',
  '-frames:v', String(MAX_FRAMES),
  path.join(FRAMES_DIR, 'frame-%03d.png'),
], { stdio: 'inherit' });

const written = fs.readdirSync(FRAMES_DIR).filter(f => f.endsWith('.png'));
console.log(`OK: ${written.length} frames salvos em ${FRAMES_DIR}/`);
