#!/usr/bin/env node
/**
 * One-time helper: turns your Google OAuth client into a long-lived refresh
 * token for the Business Profile API.
 *
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node tools/get-refresh-token.mjs
 *
 * Opens a consent screen in your browser, then prints the refresh token.
 * Run it once, store the token as a secret, and never run it again unless the
 * token is revoked.
 *
 * The OAuth client must be of type "Web application" with this exact redirect
 * URI registered:  http://127.0.0.1:5273/oauth2callback
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { loadEnv, saveToEnv } from './env-file.mjs';

await loadEnv();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// 127.0.0.1 rather than localhost, and an uncommon port: localhost resolves to
// ::1 first on macOS, so a dev server (Vite defaults to 5173) can silently
// swallow the callback. Whatever is set here must match the Authorised redirect
// URI on the OAuth client, character for character.
const REDIRECT = 'http://127.0.0.1:5273/oauth2callback';
const SCOPE = 'https://www.googleapis.com/auth/business.manage';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.');
  process.exit(1);
}

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent'          // forces a refresh token even on repeat consent
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404).end();
    return;
  }

  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');

  if (error || !code) {
    res.writeHead(400, { 'content-type': 'text/plain' })
       .end('Authorisation failed: ' + (error || 'no code returned'));
    server.close();
    process.exit(1);
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code'
    })
  });

  const token = await response.json();

  if (!token.refresh_token) {
    res.writeHead(500, { 'content-type': 'text/plain' })
       .end('No refresh token returned. Revoke the app at myaccount.google.com/permissions and try again.');
    console.error(token);
    server.close();
    process.exit(1);
  }

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
     .end('<p style="font:16px system-ui">Done. Close this tab and check your terminal.</p>');

  // written straight to .env so the token is never printed, pasted or pushed
  const file = await saveToEnv('GOOGLE_REFRESH_TOKEN', token.refresh_token);
  const masked = token.refresh_token.slice(0, 6) + '…' + token.refresh_token.slice(-4);

  console.log(`\nRefresh token saved to ${file}`);
  console.log(`  GOOGLE_REFRESH_TOKEN=${masked}  (${token.refresh_token.length} chars)`);
  console.log('\nIt does not expire unless you revoke it, or unless the OAuth app is');
  console.log('still in "Testing" mode — in that case it dies after 7 days, so publish');
  console.log('the app on the OAuth consent screen.\n');
  console.log('Next:  node tools/fetch-reviews.mjs --list\n');

  server.close();
  process.exit(0);
});

// bound to 127.0.0.1 explicitly, so nothing listening on ::1 can intercept
server.listen(5273, '127.0.0.1', () => {
  console.log('\nOpen this URL and approve access:\n\n' + authUrl + '\n');
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(opener, [authUrl], { stdio: 'ignore', detached: true }).unref();
});
