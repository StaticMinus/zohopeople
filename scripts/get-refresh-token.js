import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');

const code = process.argv[2];

if (!code) {
  console.log(`
Usage: node scripts/get-refresh-token.js <YOUR_GRANT_CODE>

Example:
  node scripts/get-refresh-token.js 1000.xxxxxxxxx...
  `);
  process.exit(1);
}

async function getRefreshToken() {
  console.log(`Exchanging Grant Code using Client ID: ${config.clientId}...`);
  try {
    const response = await axios.post(`${config.accountsUrl}/oauth/v2/token`, null, {
      params: {
        code: code.trim(),
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret
      }
    });

    if (response.data.error) {
      console.error('Zoho Error:', response.data.error);
      process.exit(1);
    }

    const refreshToken = response.data.refresh_token;
    if (!refreshToken) {
      console.error('No refresh_token returned:', response.data);
      process.exit(1);
    }

    console.log('\n✅ Successfully generated Refresh Token!');
    console.log(`Refresh Token: ${refreshToken}`);

    // Update .env file automatically
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent.replace(/ZOHO_REFRESH_TOKEN=.*/, `ZOHO_REFRESH_TOKEN=${refreshToken}`);
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✅ Automatically saved ZOHO_REFRESH_TOKEN to .env file!\n');
  } catch (err) {
    console.error('Failed to exchange code:', err.response ? err.response.data : err.message);
  }
}

getRefreshToken();
