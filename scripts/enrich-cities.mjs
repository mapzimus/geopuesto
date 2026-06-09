/**
 * Geopuesto — enrich cities1000.json with admin1 codes.
 *
 * Downloads the GeoNames cities1000.zip + admin1CodesASCII.txt,
 * rebuilds data/cities1000.json as:
 *   { name, country, lat, lon, population, admin1? }
 *
 * admin1 is the raw GeoNames admin1_code (e.g. "CA" for California,
 * "NSW" for New South Wales).  For US cities this is the familiar
 * 2-letter state abbreviation; for other countries it is whatever
 * GeoNames uses for the first administrative division.
 *
 * Run from the repo root:
 *   node scripts/enrich-cities.mjs
 *
 * Requires: Node 18+ (built-in fetch) and `unzip` on PATH (for zip extraction).
 * Falls back to a JS-only zip reader if unzip is unavailable.
 *
 * Output overwrites data/cities1000.json in place.
 */

import { createWriteStream, createReadStream, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';

const execAsync = promisify(exec);
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const TMP = join(ROOT, 'scripts', '.tmp');
const OUT = join(ROOT, 'data', 'cities1000.json');

mkdirSync(TMP, { recursive: true });

// ---- helpers ---------------------------------------------------------------

async function fetchTo(url, destPath) {
  console.log('  GET', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const out = createWriteStream(destPath);
  await pipeline(res.body, out);
  console.log('  saved ->', destPath);
}

async function fetchText(url) {
  console.log('  GET', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Read a tab-separated text file line by line, yielding string[] rows.
async function* parseTsv(path) {
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    yield line.split('\t');
  }
}

// ---- 1. Admin1 codes -------------------------------------------------------

console.log('\n[1/3] Fetching admin1 codes…');
const admin1Raw = await fetchText('https://download.geonames.org/export/dump/admin1CodesASCII.txt');

// Format: "US.CA\tCalifornia\tCalifornia\t5332921"
// Build map: "US.CA" → "CA"  (we store just the code, not the full name,
// because we want compact labels like "CA, US" not "California, United States")
const admin1Map = {};  // "COUNTRY.CODE" → code  (e.g. "US.CA" → "CA")
for (const line of admin1Raw.split('\n')) {
  const parts = line.split('\t');
  if (parts.length < 2) continue;
  const key = parts[0].trim();   // "US.CA"
  admin1Map[key] = key.split('.')[1];  // "CA"
}
console.log(`  loaded ${Object.keys(admin1Map).length} admin1 entries`);

// ---- 2. Download + extract cities1000.txt ----------------------------------

const zipPath = join(TMP, 'cities1000.zip');
const txtPath = join(TMP, 'cities1000.txt');

console.log('\n[2/3] Downloading cities1000.zip (may take a moment)…');
await fetchTo('https://download.geonames.org/export/dump/cities1000.zip', zipPath);

console.log('  Extracting…');
try {
  await execAsync(`unzip -o "${zipPath}" cities1000.txt -d "${TMP}"`);
  console.log('  Extracted via unzip');
} catch {
  // Windows: try PowerShell Expand-Archive
  try {
    await execAsync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${TMP}' -Force"`);
    console.log('  Extracted via PowerShell');
  } catch (e2) {
    throw new Error('Could not unzip. Install unzip or ensure PowerShell Expand-Archive works.\n' + e2.message);
  }
}

// ---- 3. Parse + rebuild JSON -----------------------------------------------

console.log('\n[3/3] Parsing cities1000.txt…');

// GeoNames fields (0-indexed):
// 0 geonameid, 1 name, 2 asciiname, 3 alternatenames,
// 4 latitude, 5 longitude, 6 feature_class, 7 feature_code,
// 8 country_code, 9 cc2, 10 admin1_code, 11 admin2_code,
// 12 admin3_code, 13 admin4_code, 14 population, 15 elevation,
// 16 dem, 17 timezone, 18 modification_date

const cities = [];
let skipped = 0;
for await (const f of parseTsv(txtPath)) {
  if (f.length < 15) continue;
  const pop = parseInt(f[14], 10) || 0;
  // cities1000 guarantees pop ≥ 1000 but a few entries have 0 in the field
  const lat = parseFloat(f[4]);
  const lon = parseFloat(f[5]);
  const country = f[8];
  const admin1Code = f[10];
  const name = f[1];        // use display name, not ascii-only f[2]

  if (!name || !country || isNaN(lat) || isNaN(lon)) { skipped++; continue; }

  const entry = { name, country, lat, lon, population: pop };
  if (admin1Code) {
    const key = `${country}.${admin1Code}`;
    entry.admin1 = admin1Map[key] || admin1Code;  // fall back to raw code
  }
  cities.push(entry);
}

// Sort by population descending (matches the original JSON order)
cities.sort((a, b) => (b.population || 0) - (a.population || 0));

console.log(`  parsed ${cities.length} cities (${skipped} skipped)`);
console.log('  sample US Concordes:');
cities.filter(c => c.name === 'Concord' && c.country === 'US')
  .forEach(c => console.log(`    ${JSON.stringify(c)}`));

writeFileSync(OUT, JSON.stringify(cities), 'utf8');
console.log(`\n✓ Written to ${OUT}  (${(readFileSync(OUT).length / 1e6).toFixed(1)} MB)`);
