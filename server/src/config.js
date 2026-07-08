// Central configuration, sourced from environment variables with sane defaults.
// Secrets live in a gitignored .env; this module only reads process.env.

const toInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  port: toInt(process.env.PORT, 3000),

  // Upload / content hosting
  uploadMaxMb: toInt(process.env.UPLOAD_MAX_MB, 50),
  dataDir: process.env.DATA_DIR || 'data',

  // Share-link token
  tokenTtlHours: toInt(process.env.TOKEN_TTL_H, 24),

  // Room lifecycle: reclaim empty rooms after this many minutes of inactivity
  roomIdleReclaimMinutes: toInt(process.env.ROOM_IDLE_MIN, 120),

  // Voice provider selection (drives both server backend and client provider choice)
  voiceProvider: process.env.VOICE_PROVIDER || 'mesh',
  turn: {
    url: process.env.TURN_URL || null,
    username: process.env.TURN_USER || null,
    credential: process.env.TURN_CRED || null
  },

  // CORS origin for the Socket.io / HTTP layer during dev (nginx handles prod same-origin)
  corsOrigin: process.env.CORS_ORIGIN || '*'
};
