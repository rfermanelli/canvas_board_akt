// Config centralizzata letta dalle variabili d'ambiente (vedi .env.example).

// Fail-fast: senza un JWT_SECRET robusto i token sarebbero falsificabili.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET mancante o troppo corto (min 32 caratteri)');
}

export const config = {
  port: Number(process.env.PORT || 4000),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'canvas',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'canvas_board',
  },
  jwtSecret: process.env.JWT_SECRET,
  jwtExpires: process.env.JWT_EXPIRES || '7d',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 25),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:8080',
  resetTokenTtlMin: Number(process.env.RESET_TOKEN_TTL_MIN || 60),
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || 'no-reply@canvasboard.local',
    secure: process.env.SMTP_SECURE === 'true',
  },
};
