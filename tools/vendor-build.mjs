// Reproduce the shipped runtime from pinned npm packages; no network requests.
import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = resolve(root, 'vendor');
const requireVendor = createRequire(resolve(vendor, 'package.json'));
const inventory = JSON.parse(await readFile(resolve(vendor, 'inventory.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(vendor, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(resolve(vendor, 'package-lock.json'), 'utf8'));
const mode = process.argv[2] || '--build';
if (!['--build', '--check', '--inventory', '--write'].includes(mode)) throw new Error('Usage: node tools/vendor-build.mjs [--build|--check|--inventory|--write]');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const rows = [];
const outputs = [];

function assert(condition, message) { if (!condition) throw new Error(message); }
async function installedPackage(name, expected) {
  const packageRoot = resolve(vendor, 'node_modules', name);
  const pkg = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  assert(pkg.version === expected, `${name}: install pinned version ${expected} with npm ci --prefix vendor --ignore-scripts`);
  const pinned = manifest.dependencies?.[name] || manifest.devDependencies?.[name];
  assert(pinned === expected && lock.packages?.['node_modules/' + name]?.version === expected, `${name}: manifest/lock/inventory mismatch`);
  return packageRoot;
}
for (const asset of inventory.assets) {
  const current = await readFile(resolve(root, asset.file));
  assert(sha256(current) === asset.sha256 && current.length === asset.bytes, `${asset.file}: shipped bytes differ from reviewed inventory`);
  if (mode === '--inventory') { rows.push({file: asset.file, sha256: asset.sha256, inventory: 'PASS'}); continue; }
  assert(asset.version, `${asset.file}: upstream version has not yet been verified`);
  const packageRoot = await installedPackage(asset.package, asset.version);
  let candidate;
  if (asset.file === '3d/three.min.js') {
    await installedPackage('esbuild', inventory.buildTools.esbuild);
    const esbuild = requireVendor('esbuild');
    const result = await esbuild.build({
      absWorkingDir: vendor,
      // The original build used an explicit type:commonjs package. Preserve its
      // wrapper semantics regardless of the surrounding repository package type.
      stdin: {contents: await readFile(resolve(root, asset.source), 'utf8'), sourcefile: 'entry.cjs', resolveDir: vendor},
      bundle: true, minify: true, format: 'iife', outfile: 'three.min.js', write: false,
      logLevel: 'silent'
    });
    candidate = Buffer.from(result.outputFiles[0].contents);
  } else candidate = await readFile(resolve(packageRoot, asset.source));
  assert(sha256(candidate) === asset.sha256 && candidate.length === asset.bytes, `${asset.file}: reproduction differs; review upstream/build provenance before changing the inventory or browser assets`);
  outputs.push({file: asset.file, contents: candidate});
  rows.push({file: asset.file, sha256: asset.sha256, reproduced: 'PASS'});
}
// Stage and verify EVERY asset before changing any destination file.
if (mode === '--build' || mode === '--write') {
  const destination = mode === '--write' ? root : resolve(root, 'artifacts/vendor-build');
  for (const output of outputs) {
    const path = resolve(destination, output.file);
    await mkdir(dirname(path), {recursive: true});
    await writeFile(path + '.tmp', output.contents);
    await rename(path + '.tmp', path);
  }
}
console.log(JSON.stringify({mode, assets: rows}, null, 2));
