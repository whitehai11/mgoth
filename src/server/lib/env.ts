import 'dotenv/config';
import { z } from 'zod';
const schema=z.object({NODE_ENV:z.enum(['development','production','test']).default('development'),PORT:z.coerce.number().int().positive().default(3000),ADMIN_PORT:z.coerce.number().int().positive().default(3001),DATA_DIR:z.string().default('./.data'),ADMIN_TOKEN:z.string().min(32),SESSION_SECRET:z.string().min(32),TOKEN_ENCRYPTION_KEY:z.string().min(32),SPOTIFY_CLIENT_ID:z.string().default(''),SPOTIFY_CLIENT_SECRET:z.string().default(''),SPOTIFY_REDIRECT_URI:z.string().url().default('http://localhost:3000/api/spotify/callback'),PUBLIC_BASE_URL:z.string().url().default('http://localhost:8080')});
export const env=schema.parse(process.env);
