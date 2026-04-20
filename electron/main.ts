import { app, BrowserWindow, ipcMain } from 'electron';
import { readFile } from 'fs/promises';
import { join, resolve as resolvePath, sep } from 'path';
import { fileURLToPath } from 'url';
import { createServer, type Server } from 'http';
import { existsSync } from 'fs';
import { MAX_FILE_SIZE } from '../src/lib/constants.js';
import { convertMedia, isMediaType } from '../src/lib/server/convert.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEV_SERVER_URL = process.env.ELECTRON_DEV_URL || '';
const BUILD_DIR = resolvePath(join(__dirname, '..', 'build'));

const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'application/javascript',
	'.mjs': 'application/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf'
};

// IPC: convert media file (strip metadata, re-encode)
ipcMain.handle('convert-media', async (_event, arrayBuffer: unknown, mediaType: string) => {
	if (!(arrayBuffer instanceof ArrayBuffer)) {
		throw new Error('Invalid payload: expected ArrayBuffer');
	}
	if (!isMediaType(mediaType)) {
		throw new Error('Invalid media type');
	}

	const buffer = Buffer.from(arrayBuffer);
	if (buffer.length > MAX_FILE_SIZE) {
		throw new Error('File too large');
	}

	try {
		return await convertMedia(buffer, mediaType);
	} catch (e) {
		console.error('convert-media IPC error:', e);
		throw e;
	}
});

// Simple static file server for production build.
// Lazily initialised on first call and reused across window re-creations
// (e.g. repeated macOS Dock activate events) to avoid leaking bound sockets.
// The in-flight promise is cached so concurrent callers wait on the same server,
// and the server reference is stored for graceful shutdown on app quit.
let staticServerPromise: Promise<number> | null = null;
let staticServerInstance: Server | null = null;

function getStaticServerPort(): Promise<number> {
	if (staticServerPromise !== null) {
		return staticServerPromise;
	}

	staticServerPromise = new Promise((resolve, reject) => {
		const server = createServer(async (req, res) => {
			try {
				let pathname: string;
				try {
					pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
				} catch {
					res.writeHead(400);
					res.end('Bad Request');
					return;
				}

				// Only attempt file lookup for known static asset extensions;
				// everything else is a SPA route → serve index.html
				const lastSegment = pathname.split('/').pop() || '';
				const dotIndex = lastSegment.lastIndexOf('.');
				const ext = dotIndex !== -1 ? lastSegment.slice(dotIndex) : '';
				const isKnownAsset = ext !== '' && Object.prototype.hasOwnProperty.call(MIME_TYPES, ext);

				let filePath = isKnownAsset
					? resolvePath(join(BUILD_DIR, pathname))
					: join(BUILD_DIR, 'index.html');

				// Prevent path traversal: resolved path must remain inside BUILD_DIR.
				// Use path.sep so the check is correct on both POSIX ('/') and Windows ('\').
				const buildDirWithSep = BUILD_DIR.endsWith(sep) ? BUILD_DIR : BUILD_DIR + sep;
				if (!filePath.startsWith(buildDirWithSep) && filePath !== BUILD_DIR) {
					res.writeHead(403);
					res.end('Forbidden');
					return;
				}

				// Fallback: unknown assets that don't exist on disk serve index.html.
				// This is safe — index.html is always inside BUILD_DIR.
				if (!existsSync(filePath)) {
					filePath = join(BUILD_DIR, 'index.html');
				}

				// After any fallback to index.html, derive the served extension from
				// the actual file path rather than re-parsing to avoid dual derivation
				const servedExt = filePath.endsWith('index.html') ? '.html' : ext;
				const contentType = MIME_TYPES[servedExt] || 'application/octet-stream';

				const data = await readFile(filePath);
				res.writeHead(200, { 'Content-Type': contentType });
				res.end(data);
			} catch {
				if (!res.headersSent) {
					res.writeHead(500);
					res.end('Internal Server Error');
				}
			}
		});

		staticServerInstance = server;

		server.on('error', (err) => {
			console.error('Static file server error:', err);
			reject(err);
		});

		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			if (typeof addr !== 'object' || !addr) {
				reject(new Error('Failed to determine server port'));
				return;
			}
			resolve(addr.port);
		});
	});

	return staticServerPromise;
}

async function createWindow() {
	let url: string;

	if (DEV_SERVER_URL) {
		url = DEV_SERVER_URL;
	} else {
		const port = await getStaticServerPort();
		url = `http://127.0.0.1:${port}`;
	}

	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 600,
		minHeight: 400,
		titleBarStyle: 'hiddenInset',
		backgroundColor: '#06060a',
		webPreferences: {
			preload: join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false
		}
	});

	win.loadURL(url);

	if (DEV_SERVER_URL) {
		win.webContents.openDevTools();
	}
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
	// On macOS apps conventionally stay active until explicitly quit via Cmd+Q
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

app.on('before-quit', () => {
	staticServerInstance?.close();
});
