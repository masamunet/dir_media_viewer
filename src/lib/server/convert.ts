import { execFile } from 'child_process';
import { writeFile, readFile, rm, mkdtemp } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createRequire as createNodeRequire } from 'module';
import { MAX_FILE_SIZE } from '../constants.js';

export { MAX_FILE_SIZE };

export type MediaType = 'image' | 'video';

export function isMediaType(value: unknown): value is MediaType {
	return value === 'image' || value === 'video';
}

export function sanitizeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+|\.+$/g, '_');
}

const requireFromConvert = createNodeRequire(import.meta.url);
const FALLBACK_FFMPEG_PATHS = [
	'/opt/homebrew/bin/ffmpeg',
	'/usr/local/bin/ffmpeg',
	'/usr/bin/ffmpeg'
];

function resolveUnpackedAsarPath(path: string): string {
	if (!path.includes('app.asar')) return path;
	const unpackedPath = path.replace('app.asar', 'app.asar.unpacked');
	return existsSync(unpackedPath) ? unpackedPath : path;
}

export function getFfmpegPath(): string {
	if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
		return process.env.FFMPEG_PATH;
	}

	try {
		const staticPath = requireFromConvert('ffmpeg-static') as string | null;
		if (staticPath) {
			const resolvedPath = resolveUnpackedAsarPath(staticPath);
			if (existsSync(resolvedPath)) return resolvedPath;
		}
	} catch {
		// Optional dependency fallback: use system ffmpeg below.
	}

	const fallbackPath = FALLBACK_FFMPEG_PATHS.find((path) => existsSync(path));
	return fallbackPath ?? 'ffmpeg';
}

export function runFfmpeg(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const ffmpegPath = getFfmpegPath();
		const pathValue = process.env.PATH ?? '';
		const env = {
			...process.env,
			PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${pathValue ? `:${pathValue}` : ''}`
		};

		execFile(ffmpegPath, args, { timeout: 120000, killSignal: 'SIGKILL', env }, (err, _stdout, stderr) => {
			if (err) reject(new Error(`${err.message}${stderr ? `\nffmpeg stderr: ${stderr.slice(-500)}` : ''}`));
			else resolve();
		});
	});
}

export interface ConvertResult {
	buffer: ArrayBuffer;
	ext: string;
	mimeType: string;
}

/**
 * Re-encodes a media file with all metadata stripped.
 *
 * Images: two-stage PPM pipeline — single-pass ffmpeg retains ICC profiles
 * as side data even with -map_metadata -1, so decoding to raw PPM (which
 * has no metadata capacity) before re-encoding guarantees a clean output.
 *
 * Videos: H.264/AAC re-encode with container, stream, and chapter metadata
 * removed and bitexact flags suppressing encoder version strings.
 */
export async function convertMedia(inputBuffer: Buffer, mediaType: MediaType): Promise<ConvertResult> {
	const isVideo = mediaType === 'video';
	const dir = await mkdtemp(join(tmpdir(), 'dmv-'));
	const inputPath = join(dir, 'input');
	const outputPath = join(dir, isVideo ? 'output.mp4' : 'output.jpg');

	try {
		await writeFile(inputPath, inputBuffer);

		if (isVideo) {
			await runFfmpeg([
				'-i', inputPath,
				'-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
				'-c:a', 'aac', '-b:a', '128k',
				'-map_metadata', '-1',
				'-map_metadata:s:v', '-1',
				'-map_metadata:s:a', '-1',
				'-map_chapters', '-1',
				'-fflags', '+bitexact',
				'-flags:v', '+bitexact',
				'-flags:a', '+bitexact',
				'-metadata:s:v:0', 'encoder=',
				'-metadata:s:a:0', 'encoder=',
				'-movflags', '+faststart',
				'-y', outputPath
			]);
		} else {
			const interPath = join(dir, 'inter.ppm');
			await runFfmpeg([
				'-i', inputPath,
				'-frames:v', '1',
				'-vcodec', 'ppm',
				'-f', 'image2',
				'-y', interPath
			]);
			await runFfmpeg([
				'-i', interPath,
				'-q:v', '2',
				'-map_metadata', '-1',
				'-fflags', '+bitexact',
				'-flags:v', '+bitexact',
				'-bitexact',
				'-y', outputPath
			]);
		}

		const output = await readFile(outputPath);
		// new Uint8Array(typedArray) — the constructor form, not the .buffer accessor —
		// allocates a fresh ArrayBuffer of output.byteLength bytes and copies data into it
		// (ECMAScript §23.2.5.1). No pool aliasing regardless of source backing store.
		const buffer = new Uint8Array(output).buffer;

		return {
			buffer,
			ext: isVideo ? 'mp4' : 'jpg',
			mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
		};
	} finally {
		await rm(dir, { recursive: true }).catch(() => {});
	}
}
