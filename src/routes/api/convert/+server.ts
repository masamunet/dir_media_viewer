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
			// Two-stage pipeline: decode to raw PPM (no metadata/ICC/side data)
			// then re-encode to JPEG. Single-pass ffmpeg preserves ICC via side data
			// even with -map_metadata -1, so an intermediate raw format is required
			// to guarantee all extraneous data is dropped.
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
