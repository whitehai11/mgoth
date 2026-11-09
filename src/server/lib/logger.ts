import pino from 'pino';
export const logger=pino({level:process.env.LOG_LEVEL??'info',redact:{paths:['req.headers.authorization','req.headers.cookie','*.clientSecret','*.access_token','*.refresh_token','*.code'],censor:'[REDACTED]'},base:{service:'mgoth-api'}});
