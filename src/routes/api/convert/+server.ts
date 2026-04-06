import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { execFile } from 'child_process';
import { writeFile, readFile, rm, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

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

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const file = formData.get('file') as File;
	const type = formData.get('type') as string;

	if (!file || !type) {
		return json({ error: 'Missing file or type' }, { status: 400 });
	}

	if (file.size > MAX_FILE_SIZE) {
		return json({ error: 'File too large' }, { status: 413 });
	}

	const dir = await mkdtemp(join(tmpdir(), 'dmv-'));
	const safeName = sanitizeFilename(file.name);
	const inputPath = join(dir, `input_${safeName}`);
	const isVideo = type === 'video';
	const outputPath = join(dir, isVideo ? 'output.mp4' : 'output.jpg');

	try {
		const buffer = Buffer.from(await file.arrayBuffer());
		await writeFile(inputPath, buffer);

		const args = isVideo
			? ['-i', inputPath, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-map_metadata', '-1', '-movflags', '+faststart', '-y', outputPath]
			: ['-i', inputPath, '-q:v', '2', '-map_metadata', '-1', '-y', outputPath];

		await runFfmpeg(args);
		const output = await readFile(outputPath);

		const ext = isVideo ? 'mp4' : 'jpg';
		const baseName = file.name.replace(/\.[^.]+$/, '') || 'download';
		const safeFallback = sanitizeFilename(baseName);
		const encoded = encodeURIComponent(`${baseName}.${ext}`);

		return new Response(output, {
			headers: {
				'Content-Type': isVideo ? 'video/mp4' : 'image/jpeg',
				'Content-Disposition': `attachment; filename="${safeFallback}.${ext}"; filename*=UTF-8''${encoded}`,
			}
		});
	} catch (e) {
		console.error('Convert error:', e);
		return json({ error: 'Conversion failed' }, { status: 500 });
	} finally {
		await rm(dir, { recursive: true }).catch(() => {});
	}
};
