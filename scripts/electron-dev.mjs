import { createServer } from 'vite';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Start Vite dev server on a random available port (port 0)
const server = await createServer({
	root: projectRoot,
	server: { port: 0, strictPort: false }
});

await server.listen();
const address = server.httpServer.address();
const port = typeof address === 'object' && address ? address.port : 5173;
const url = `http://localhost:${port}`;

console.log(`Vite dev server started at ${url}`);

// Launch Electron with the dev server URL
const electronPath = resolve(projectRoot, 'node_modules', '.bin', 'electron');
const electron = spawn(electronPath, ['.'], {
	cwd: projectRoot,
	stdio: 'inherit',
	env: { ...process.env, ELECTRON_DEV_URL: url }
});

electron.on('close', () => {
	server.close();
	process.exit(0);
});

process.on('SIGINT', () => {
	electron.kill();
	server.close();
	process.exit(0);
});
