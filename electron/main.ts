import { app, BrowserWindow, ipcMain } from 'electron';
import { execFile } from 'child_process';
import { writeFile, readFile, rm, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEV_SERVER_URL = process.env.ELECTRON_DEV_URL || '';
const BUILD_DIR = join(__dirname, '..', 'build');
const MAX_FILE_SIZE = 500 * 1024 * 1024;

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

function sanitizeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function runFfmpeg(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile('ffmpeg', args, { timeout: 120000 }, (err, _stdout, stderr) => {
			if (err) reject(new Error(stderr || err.message));
			else resolve();
		});
	});
}

// IPC: convert media file (strip metadata, re-encode)
ipcMain.handle('convert-media', async (_event, arrayBuffer: ArrayBuffer, fileName: string, mediaType: string) => {
	const buffer = Buffer.from(arrayBuffer);

	if (buffer.length > MAX_FILE_SIZE) {
		throw new Error('File too large');
	}

	const dir = await mkdtemp(join(tmpdir(), 'dmv-'));
	const safeName = sanitizeFilename(fileName);
	const inputPath = join(dir, `input_${safeName}`);
	const isVideo = mediaType === 'video';
	const outputPath = join(dir, isVideo ? 'output.mp4' : 'output.jpg');

	try {
		await writeFile(inputPath, buffer);

		const args = isVideo
			? ['-i', inputPath, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-map_metadata', '-1', '-movflags', '+faststart', '-y', outputPath]
			: ['-i', inputPath, '-q:v', '2', '-map_metadata', '-1', '-y', outputPath];

		await runFfmpeg(args);
		const output = await readFile(outputPath);

		return {
			buffer: output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength),
			ext: isVideo ? 'mp4' : 'jpg',
			mimeType: isVideo ? 'video/mp4' : 'image/jpeg'
		};
	} finally {
		await rm(dir, { recursive: true }).catch(() => {});
	}
});

// Simple static file server for production build
function startStaticServer(): Promise<number> {
	return new Promise((resolve) => {
		const server = createServer((req, res) => {
			let pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);

			// Check if this looks like a file request (has extension in last segment)
			const lastSegment = pathname.split('/').pop() || '';
			const hasExtension = lastSegment.includes('.');

			let filePath: string;
			if (hasExtension) {
				filePath = join(BUILD_DIR, pathname);
				if (!existsSync(filePath)) {
					filePath = join(BUILD_DIR, 'index.html');
				}
			} else {
				filePath = join(BUILD_DIR, 'index.html');
			}

			const ext = '.' + filePath.split('.').pop();
			const contentType = MIME_TYPES[ext] || 'application/octet-stream';

			try {
				const data = readFileSync(filePath);
				res.writeHead(200, { 'Content-Type': contentType });
				res.end(data);
			} catch {
				res.writeHead(404);
				res.end('Not Found');
			}
		});

		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			const port = typeof addr === 'object' && addr ? addr.port : 0;
			resolve(port);
		});
	});
}

async function createWindow() {
	let url: string;

	if (DEV_SERVER_URL) {
		url = DEV_SERVER_URL;
	} else {
		const port = await startStaticServer();
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
	app.quit();
});

app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});
