module.exports = {
  apps: [
    {
      name: 'whatsapp-photogif',
      script: 'src/animate-avatar.js',
      cwd: __dirname,
      // Não sobrescreva INTERVAL_MS aqui - o padrão de 10s no código já é o
      // piso seguro medido (ver FINDINGS.md). Baixar isso bate rate limit.
      env: {},
      autorestart: true,
      // Espera antes de reiniciar após crash - evita bater reconectando rápido
      // demais no WhatsApp se cair por instabilidade de rede/sessão.
      restart_delay: 15000,
      max_restarts: 20,
      min_uptime: '30s',
    },
  ],
};
