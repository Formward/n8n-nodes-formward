// Copies node icon assets (.svg/.png) from source node folders into the compiled
// dist tree, preserving relative paths, so n8n can resolve `file:<icon>` next to
// each compiled .node.js. Dependency-free (Node built-ins only).
import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, '');
const srcRoot = join(root, 'nodes');
const distRoot = join(root, 'dist', 'nodes');

const ICON_EXT = new Set(['.svg', '.png']);

function walk(dir) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			walk(full);
			continue;
		}
		const dot = entry.lastIndexOf('.');
		const ext = dot === -1 ? '' : entry.slice(dot).toLowerCase();
		if (!ICON_EXT.has(ext)) continue;
		const rel = relative(srcRoot, full);
		const dest = join(distRoot, rel);
		mkdirSync(dirname(dest), { recursive: true });
		cpSync(full, dest);
		console.log(`copied icon: nodes/${rel}`);
	}
}

try {
	walk(srcRoot);
} catch (err) {
	console.error('icon copy failed:', err.message);
	process.exit(1);
}
