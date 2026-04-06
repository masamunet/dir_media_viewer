import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

function run(cmd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
			if (err) reject(new Error(stderr || err.message));
			else resolve(stdout);
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

	const dir = await mkdtemp(join(tmpdir(), 'dmv-'));
	const inputPath = join(dir, `input_${file.name}`);
	const isVideo = type === 'video';
	const outputPath = join(dir, isVideo ? 'output.mp4' : 'output.jpg');

	try {
		const buffer = Buffer.from(await file.arrayBuffer());
		await writeFile(inputPath, buffer);

		const cmd = isVideo
			? `ffmpeg -i "${inputPath}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -map_metadata -1 -movflags +faststart -y "${outputPath}"`
			: `ffmpeg -i "${inputPath}" -q:v 2 -map_metadata -1 -y "${outputPath}"`;

		await run(cmd);
		const output = await readFile(outputPath);

		return new Response(output, {
			headers: {
				'Content-Type': isVideo ? 'video/mp4' : 'image/jpeg',
				'Content-Disposition': `attachment; filename="${file.name.replace(/\.[^.]+$/, '')}.${isVideo ? 'mp4' : 'jpg'}"`,
			}
		});
	} catch (e) {
		console.error('Convert error:', e);
		return json({ error: 'Conversion failed' }, { status: 500 });
	} finally {
		await unlink(inputPath).catch(() => {});
		await unlink(outputPath).catch(() => {});
	}
};
