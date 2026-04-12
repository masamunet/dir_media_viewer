import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Verify build artifacts exist
const requiredFiles = ['dist-electron/main.mjs', 'dist-electron/preload.cjs', 'build/index.html'];
for (const file of requiredFiles) {
	if (!existsSync(resolve(projectRoot, file))) {
		console.error(`Error: ${file} not found. Run "npm run build && npm run build:electron" first.`);
		process.exit(1);
	}
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
} catch (err) {
	if (err.status !== null) {
		console.error(`electron-builder exited with code ${err.status}`);
	} else {
		console.error('Failed to run electron-builder:', err.message);
	}
	process.exit(err.status ?? 1);
}
