import { createServer } from 'vite';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Start Vite dev server on a random available port (port 0)
let server;
try {
	server = await createServer({
		root: projectRoot,
		server: { port: 0, strictPort: false }
	});
	await server.listen();
} catch (err) {
	console.error('Failed to start Vite dev server:', err.message);
	process.exit(1);
}

const address = server.httpServer.address();
if (!address || typeof address === 'string') {
	console.error('Failed to determine dev server port');
	await server.close();
	process.exit(1);
}
const port = address.port;
const url = `http://localhost:${port}`;

console.log(`Vite dev server started at ${url}`);

// Launch Electron with the dev server URL
const electronPath = resolve(projectRoot, 'node_modules', '.bin', 'electron');
const electron = spawn(electronPath, ['.'], {
	cwd: projectRoot,
	stdio: 'inherit',
	env: { ...process.env, ELECTRON_DEV_URL: url }
});

let shuttingDown = false;

async function cleanup() {
	if (shuttingDown) return;
	shuttingDown = true;
	if (!electron.killed) {
		electron.kill();
	}
	await server.close();
	process.exit(0);
}

electron.on('close', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
