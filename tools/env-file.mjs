/**
 * Minimal .env support — no dependencies.
 *
 * The .env file lives in the project root and is git-ignored. It holds the
 * Google OAuth credentials so they never have to be typed on the command line
 * (where they end up in your shell history).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');

const LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;
const unquote = (value) => value.replace(/^(['"])(.*)\1$/s, '$2');

/** Load .env into process.env. Real environment variables always win, so a
 *  CI runner's secrets override whatever is in the file. */
export async function loadEnv() {
  let text;
  try {
    text = await readFile(ENV_PATH, 'utf8');
  } catch {
    return;                       // no .env — fine, we are probably in CI
  }

  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(LINE);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = unquote(match[2]);
    }
  }
}

/** Add or replace a single key in .env, leaving everything else intact. */
export async function saveToEnv(key, value) {
  let text = '';
  try {
    text = await readFile(ENV_PATH, 'utf8');
  } catch { /* creating it fresh */ }

  const lines = text.split('\n');
  const index = lines.findIndex((line) => (line.match(LINE) || [])[1] === key);
  const entry = `${key}=${value}`;

  if (index === -1) {
    if (text && !text.endsWith('\n')) lines.push('');
    lines.push(entry, '');
  } else {
    lines[index] = entry;
  }

  await writeFile(ENV_PATH, lines.join('\n'), { mode: 0o600 });
  return ENV_PATH;
}
