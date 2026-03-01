'use strict';
require('dotenv').config();

module.exports = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_change_me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  DB_PATH: process.env.DB_PATH || './kingshelp.db',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || null,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || null,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || `http://localhost:${parseInt(process.env.PORT || '3000', 10)}`,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || null,
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || null,
  MAIL_FROM: process.env.MAIL_FROM || null,
  CORS_ORIGINS: process.env.CORS_ORIGINS || null,
};
