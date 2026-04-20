import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MAX_FILE_SIZE, sanitizeFilename, convertMedia, isMediaType } from '$lib/server/convert';

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const rawFile = formData.get('file');
	const type = formData.get('type');

	if (!(rawFile instanceof File) || typeof type !== 'string' || !type) {
		return json({ error: 'Missing file or type' }, { status: 400 });
	}

	const file = rawFile;

	if (!isMediaType(type)) {
		return json({ error: 'Invalid type' }, { status: 400 });
	}

	if (file.size > MAX_FILE_SIZE) {
		return json({ error: 'File too large' }, { status: 413 });
	}

	try {
		const inputBuffer = Buffer.from(await file.arrayBuffer());
		const result = await convertMedia(inputBuffer, type);

		const baseName = file.name.replace(/\.[^.]+$/, '') || 'download';
		const safeFallback = sanitizeFilename(baseName);
		// RFC 5987 attr-char excludes * ( ) ' — encodeURIComponent leaves these unencoded
		const encoded = encodeURIComponent(`${baseName}.${result.ext}`)
			.replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

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
