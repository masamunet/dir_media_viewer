import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MAX_FILE_SIZE, sanitizeFilename, convertMedia } from '$lib/server/convert';

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const type = formData.get('type');

	if (!file || !type) {
		return json({ error: 'Missing file or type' }, { status: 400 });
	}

	if (type !== 'video' && type !== 'image') {
		return json({ error: 'Invalid type' }, { status: 400 });
	}

	if (file.size > MAX_FILE_SIZE) {
		return json({ error: 'File too large' }, { status: 413 });
	}

	try {
		const inputBuffer = Buffer.from(await file.arrayBuffer());
		const result = await convertMedia(inputBuffer, type as 'video' | 'image');

		const baseName = file.name.replace(/\.[^.]+$/, '') || 'download';
		const safeFallback = sanitizeFilename(baseName);
		// RFC 5987 ext-value: encodeURIComponent covers most chars, but single-quote
		// must also be percent-encoded as it delimits the charset prefix in filename*
		const encoded = encodeURIComponent(`${baseName}.${result.ext}`).replace(/'/g, '%27');

		return new Response(result.buffer, {
			headers: {
				'Content-Type': result.mimeType,
				'Content-Disposition': `attachment; filename="${safeFallback}.${result.ext}"; filename*=UTF-8''${encoded}`,
			}
		});
	} catch (e) {
		console.error('Convert error:', e);
		return json({ error: 'Conversion failed' }, { status: 500 });
	}
};
