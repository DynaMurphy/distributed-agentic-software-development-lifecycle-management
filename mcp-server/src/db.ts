import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load from local .env first, then parent .env.local
dotenv.config();
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const connectionConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'spec_docs',
      password: process.env.DB_PASSWORD || 'password',
      port: parseInt(process.env.DB_PORT || '5432'),
    };

const pool = new Pool(connectionConfig);

export const query = (text: string, params?: any[]) => pool.query(text, params);

export const getClient = () => pool.connect();
