#!/usr/bin/env node
/**
 * Fetches EVERY review for your Google Business Profile and bakes them into
 * index.html as plain HTML, so they are real indexable page content rather
 * than something JavaScript loads afterwards.
 *
 * Required environment variables:
 *   GOOGLE_CLIENT_ID       OAuth client id
 *   GOOGLE_CLIENT_SECRET   OAuth client secret
 *   GOOGLE_REFRESH_TOKEN   from tools/get-refresh-token.mjs
 *
 * Optional:
 *   GBP_LOCATION           "accounts/123/locations/456" — skips discovery
 *   MAX_REVIEWS            how many to show on the page (default 12)
 *   MIN_RATING             lowest star rating to show (default 4)
 *
 * Usage:  node tools/fetch-reviews.mjs
 *         node tools/fetch-reviews.mjs --list      (print account/location ids)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv, ROOT } from './env-file.mjs';

await loadEnv();

const HTML = path.join(ROOT, 'index.html');
const JSON_OUT = path.join(ROOT, 'assets', 'data', 'reviews.json');

const MAX_REVIEWS = Number(process.env.MAX_REVIEWS || 12);
const MIN_RATING = Number(process.env.MIN_RATING || 4);
const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

const need = (name) => {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See README.md section 3.`);
    process.exit(1);
  }
  return value;
};

/* ------------------------------------------------------------------ auth */
async function accessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: need('GOOGLE_CLIENT_ID'),
      client_secret: need('GOOGLE_CLIENT_SECRET'),
      refresh_token: need('GOOGLE_REFRESH_TOKEN'),
      grant_type: 'refresh_token'
    })
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

async function api(url, token) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(
        `403 from ${url}\n` +
        'Usually means the Business Profile API access request has not been approved yet, ' +
        'or the APIs are not enabled on this Cloud project.\n' +
        JSON.stringify(body)
      );
    }
    throw new Error(`${response.status} from ${url}: ${JSON.stringify(body)}`);
  }
  return body;
}

/* -------------------------------------------------------------- discovery */
async function findLocation(token) {
  if (process.env.GBP_LOCATION) return process.env.GBP_LOCATION;

  const { accounts = [] } = await api(
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts', token);
  if (!accounts.length) throw new Error('No Business Profile accounts on this Google account.');

  for (const account of accounts) {
    const { locations = [] } = await api(
      'https://mybusinessbusinessinformation.googleapis.com/v1/' +
      `${account.name}/locations?readMask=name,title&pageSize=100`, token);

    for (const location of locations) {
      // location.name is "locations/123"; the reviews endpoint wants the
      // account-scoped form
      const full = `${account.name}/${location.name}`;
      console.log(`  found: ${location.title}  ->  GBP_LOCATION=${full}`);
      if (!process.argv.includes('--list')) return full;
    }
  }

  if (process.argv.includes('--list')) process.exit(0);
  throw new Error('No locations found on any account.');
}

/* ---------------------------------------------------------------- reviews */
async function allReviews(location, token) {
  const collected = [];
  let pageToken = '';
  let meta = {};

  do {
    const url = `https://mybusiness.googleapis.com/v4/${location}/reviews` +
      `?pageSize=50${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const page = await api(url, token);
    collected.push(...(page.reviews || []));
    meta = { average: page.averageRating, total: page.totalReviewCount };
    pageToken = page.nextPageToken || '';
  } while (pageToken);

  return { reviews: collected, ...meta };
}

/* ----------------------------------------------------------------- render */
const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const monthYear = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

const STAR_PATH = 'M12 17.3l-6.2 3.7 1.7-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.5 4.8 1.7 7z';

function starsMarkup(rating) {
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
    `<path fill="${i < rating ? 'currentColor' : '#d9d2c3'}" d="${STAR_PATH}"/></svg>`
  ).join('');
  return `<div class="review__stars" role="img" aria-label="${rating} out of 5 stars">${stars}</div>`;
}

function reviewMarkup(review) {
  const name = escapeHtml(review.author);
  const when = review.when ? `\n            <p class="review__date">${escapeHtml(review.when)}</p>` : '';
  return `        <li class="review">
          ${starsMarkup(review.rating)}
          <p class="review__text">${escapeHtml(review.text)}</p>
          <div class="review__meta">
            <span class="review__avatar" aria-hidden="true">${escapeHtml(review.initial)}</span>
            <div>
            <p class="review__name">${name}</p>${when}
            </div>
          </div>
        </li>`;
}

function replaceBetween(source, startMark, endMark, replacement, label) {
  const start = source.indexOf(startMark);
  const end = source.indexOf(endMark);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not find the ${label} markers in index.html`);
  }
  return source.slice(0, start + startMark.length) + replacement + source.slice(end);
}

/* ------------------------------------------------------------------- main */
const token = await accessToken();
const location = await findLocation(token);
console.log(`Location: ${location}`);

const raw = await allReviews(location, token);
console.log(`Google returned ${raw.reviews.length} review(s); average ${raw.average}`);

const reviews = raw.reviews
  .map((review) => ({
    rating: STARS[review.starRating] || 0,
    text: (review.comment || '').replace(/\s+/g, ' ').trim(),
    author: review.reviewer?.displayName?.trim() || 'Google user',
    when: monthYear(review.createTime),
    createTime: review.createTime
  }))
  .filter((review) => review.rating >= MIN_RATING && review.text)
  .sort((a, b) => new Date(b.createTime) - new Date(a.createTime))
  .slice(0, MAX_REVIEWS)
  .map((review) => ({ ...review, initial: (review.author[0] || '?').toUpperCase() }));

console.log(`Publishing ${reviews.length} (>= ${MIN_RATING} stars, with text, newest first)`);

if (!reviews.length) {
  console.error('Nothing to publish — leaving index.html untouched.');
  process.exit(1);
}

const list = `
      <ul class="reviews" role="list">
${reviews.map(reviewMarkup).join('\n')}
      </ul>
      `;

const average = Number(raw.average || 0);
const total = Number(raw.total || raw.reviews.length);
const summary = average
  ? `Rated ${average.toFixed(1)} out of 5 by ${total} ${total === 1 ? 'customer' : 'customers'} on Google.`
  : 'Reviews from our Google Business Profile.';

let html = await readFile(HTML, 'utf8');
html = replaceBetween(html, '<!-- REVIEWS:START -->', '<!-- REVIEWS:END -->', list, 'review list');
html = replaceBetween(html, '<!-- REVIEWS_SUMMARY:START -->', '<!-- REVIEWS_SUMMARY:END -->',
  escapeHtml(summary), 'summary');
await writeFile(HTML, html);

await mkdir(path.dirname(JSON_OUT), { recursive: true });
await writeFile(JSON_OUT, JSON.stringify({
  fetchedAt: new Date().toISOString(), average, total, reviews
}, null, 2));

console.log('index.html and assets/data/reviews.json updated.');
