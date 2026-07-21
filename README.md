# WhatsApp PhotoGif — gambiarra de foto de perfil animada

O WhatsApp não aceita GIF como foto de perfil. O jeito que funciona de verdade é
essa gambiarra: um bot conectado à sua própria conta (via WhatsApp Web/Baileys)
fatia o GIF em alguns frames e fica **trocando a foto de perfil em loop**. Não
anima "ao vivo" na tela de quem olha, mas quem checar seu perfil em momentos
diferentes vai ver o avatar mudando — efeito de flipbook/stop-motion.

Roda com sua própria conta, sem app modificado (GBWhatsApp etc.) — usa o
protocolo oficial do WhatsApp Web via [Baileys](https://github.com/WhiskeySockets/Baileys).

## Uso

1. Coloque seu GIF em `assets/avatar.gif`

2. Extraia os frames (ffmpeg já instalado):
   ```bash
   npm run extract
   ```
   Por padrão extrai até 16 frames, 640x640, cortado quadrado. Ajustável:
   ```bash
   MAX_FRAMES=10 SIZE=512 npm run extract
   ```

3. Rode o bot:
   ```bash
   npm start
   ```
   Escaneie o QR code (WhatsApp no celular > Aparelhos conectados > Conectar
   um aparelho). A sessão fica salva em `auth_info/` — não precisa escanear de
   novo nas próximas vezes.

4. Deixe rodando (ex: num screen/tmux, ou com `pm2`). Ctrl+C para parar.

## Ajustes

- `INTERVAL_MS` (padrão 8000 = 8s): intervalo entre trocas de foto.
  **Medido contra o servidor real, não é chute**: varredura completa em
  [`FINDINGS.md`](FINDINGS.md) mostrou que 3s/6s/7s falham com
  `rate-overlimit` em menos de 45s, e 8s/9s/10s ficaram limpos (~90-150s sem
  falha). 8s é o mais rápido confirmado seguro, mas fica logo acima da
  fronteira de falha (7s) — menos margem que 10s pra rodar dias sem parar.
  Se aparecer `rate-overlimit` nos logs, suba pra 9s ou 10s. O script já faz
  backoff automático se uma troca falhar.
- `MAX_FRAMES`: quantos frames extrair do GIF (menos frames = ciclo completo
  mais rápido, mais frames = animação mais suave, mas ciclo mais longo).

Detalhe completo do rate limit medido (linha do tempo, números reais, e por
que "modo rajada" foi tentado e descartado) em [`FINDINGS.md`](FINDINGS.md).

## Por que não uma solução "de verdade"

Foto de perfil do WhatsApp é sempre uma imagem estática do lado do servidor —
não existe endpoint que aceite vídeo/GIF como avatar de contato (diferente do
Status, que aceita vídeo). Esse loop de troca é a única forma de simular
animação sem usar cliente não-oficial.
