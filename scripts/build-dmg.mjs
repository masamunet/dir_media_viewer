import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Verify build artifacts exist
if (!existsSync(resolve(projectRoot, 'dist-electron', 'main.mjs'))) {
	console.error('Error: dist-electron/main.mjs not found. Run "npm run build && npm run build:electron" first.');
	process.exit(1);
}

// Generate build timestamp in YYYYMMDDHHmmss format (local time)
const now = new Date();
const timestamp = now.getFullYear().toString()
	+ String(now.getMonth() + 1).padStart(2, '0')
	+ String(now.getDate()).padStart(2, '0')
	+ String(now.getHours()).padStart(2, '0')
	+ String(now.getMinutes()).padStart(2, '0')
	+ String(now.getSeconds()).padStart(2, '0');

// Run electron-builder with custom artifact name including timestamp
const electronBuilder = resolve(projectRoot, 'node_modules', '.bin', 'electron-builder');
try {
	execFileSync(
		electronBuilder,
		['--config.artifactName', `\${productName}_${timestamp}.\${ext}`],
		{ stdio: 'inherit', cwd: projectRoot }
	);
} catch {
	process.exit(1);
}
