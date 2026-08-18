import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');

const clientId = '1000.X25612NSY7FV4ZOJRMAP4JNV3K78VX';
const clientSecret = '88d9aebffe80efbc10b0abca6930143ef7348e6565';
const code = process.argv[2];

if (!code) {
  console.log('Usage: node scripts/exchange-now.js <CODE>');
  process.exit(1);
}

async function run() {
  console.log(`Exchanging code: ${code}`);

  // Test variations: with/without redirect_uri, params vs body
  const variations = [
    { url: 'https://accounts.zoho.com/oauth/v2/token', params: { grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code: code.trim() } },
    { url: 'https://accounts.zoho.com/oauth/v2/token', params: { grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code: code.trim(), redirect_uri: 'https://accounts.zoho.com' } }
  ];

  for (const v of variations) {
    try {
      const res = await axios.post(v.url, null, { params: v.params });
      console.log('API Response:', JSON.stringify(res.data, null, 2));
      if (res.data.refresh_token) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        envContent = envContent.replace(/ZOHO_REFRESH_TOKEN=.*/, `ZOHO_REFRESH_TOKEN=${res.data.refresh_token}`);
        fs.writeFileSync(envPath, envContent, 'utf8');
        console.log('SUCCESS! Refresh token saved to .env');
        process.exit(0);
      }
    } catch (err) {
      console.log('API Error:', err.response ? err.response.data : err.message);
    }
  }
}

run();
