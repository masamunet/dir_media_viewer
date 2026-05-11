import { app, BrowserWindow, dialog, ipcMain, nativeImage } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import { join, resolve as resolvePath, sep } from 'path';
import { fileURLToPath } from 'url';
import { createServer, type Server } from 'http';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
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

function validatedMediaBuffer(arrayBuffer: unknown): Buffer {
	if (!(arrayBuffer instanceof ArrayBuffer)) {
		throw new Error('Invalid payload: expected ArrayBuffer');
	}

	const buffer = Buffer.from(arrayBuffer);
	if (buffer.length > MAX_FILE_SIZE) {
		throw new Error('File too large');
	}

	return buffer;
}

function defaultExportFilename(defaultFilename: unknown, mediaType: 'image' | 'video'): string {
	const ext = mediaType === 'video' ? '.mp4' : '.jpg';
	const fallback = mediaType === 'video' ? `export${ext}` : `export${ext}`;
	if (typeof defaultFilename !== 'string' || !defaultFilename.trim()) return fallback;

	const cleaned = defaultFilename.trim().replace(/[/:\\]/g, '_');
	return cleaned.toLowerCase().endsWith(ext) ? cleaned : `${cleaned}${ext}`;
}

const pendingExportPaths = new Map<string, string>();

// IPC: choose an export destination before starting expensive conversion work.
ipcMain.handle('select-export-path', async (event, mediaType: string, defaultFilename: unknown) => {
	if (!isMediaType(mediaType)) {
		throw new Error('Invalid media type');
	}
	const win = BrowserWindow.fromWebContents(event.sender);
	const saveOptions = {
		defaultPath: defaultExportFilename(defaultFilename, mediaType),
		filters: [
			mediaType === 'video'
				? { name: 'MP4 Video', extensions: ['mp4'] }
				: { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }
		]
	};
	const saveResult = win
		? await dialog.showSaveDialog(win, saveOptions)
		: await dialog.showSaveDialog(saveOptions);

	if (saveResult.canceled || !saveResult.filePath) {
		return { canceled: true };
	}

	const token = randomUUID();
	pendingExportPaths.set(token, saveResult.filePath);
	return { canceled: false, token, filePath: saveResult.filePath };
});

// IPC: convert media and write it to a destination selected by select-export-path.
ipcMain.handle('write-export-media', async (_event, token: unknown, arrayBuffer: unknown, mediaType: string) => {
	if (typeof token !== 'string') {
		throw new Error('Invalid export token');
	}
	if (!isMediaType(mediaType)) {
		throw new Error('Invalid media type');
	}

	const filePath = pendingExportPaths.get(token);
	if (!filePath) {
		throw new Error('Export destination expired');
	}
	pendingExportPaths.delete(token);

	const buffer = validatedMediaBuffer(arrayBuffer);
	const result = await convertMedia(buffer, mediaType);
	await writeFile(filePath, Buffer.from(result.buffer));
	return { filePath };
});

// Simple static file server for production build.
// Lazily initialised on first call and reused across window re-creations
// (e.g. repeated macOS Dock activate events) to avoid leaking bound sockets.
// The in-flight promise is cached so concurrent callers wait on the same server,
// and the server reference is stored for graceful shutdown on app quit.
let staticServerPromise: Promise<number> | null = null;
let staticServerInstance: Server | null = null;

function getAppIconPath() {
	return resolvePath(join(__dirname, '..', DEV_SERVER_URL ? 'static' : 'build', 'favicon.png'));
}

function getStaticServerPort(): Promise<number> {
	if (staticServerPromise !== null) {
		return staticServerPromise;
	}

	staticServerPromise = new Promise((resolve, reject) => {
		let settled = false;
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
				if (!filePath.startsWith(buildDirWithSep)) {
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
			if (!settled) {
				settled = true;
				server.close();
				staticServerInstance = null;
				staticServerPromise = null;
				reject(err);
			}
		});

		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			if (typeof addr !== 'object' || !addr) {
				settled = true;
				server.close();
				staticServerInstance = null;
				staticServerPromise = null;
				reject(new Error('Failed to determine server port'));
				return;
			}
			settled = true;
			resolve(addr.port);
		});
	});

	return staticServerPromise;
}

async function createWindow() {
	let url: string;
	const iconPath = getAppIconPath();

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
		icon: iconPath,
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

app.whenReady().then(() => {
	if (process.platform === 'darwin') {
		app.dock.setIcon(nativeImage.createFromPath(getAppIconPath()));
	}
	return createWindow();
});

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
