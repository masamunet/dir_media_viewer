export interface ElectronAPI {
	convertMedia: (
		arrayBuffer: ArrayBuffer,
		fileName: string,
		mediaType: string
	) => Promise<{ buffer: ArrayBuffer; ext: string; mimeType: string }>;
}

declare global {
	interface Window {
		electronAPI?: ElectronAPI;
	}
}

export function isElectron(): boolean {
	return typeof window !== 'undefined' && !!window.electronAPI;
}

export async function convertMediaElectron(
	file: File,
	mediaType: string
): Promise<Blob> {
	const api = window.electronAPI;
	if (!api) throw new Error('Electron API not available');

	const arrayBuffer = await file.arrayBuffer();
	const result = await api.convertMedia(arrayBuffer, file.name, mediaType);
	return new Blob([result.buffer], { type: result.mimeType });
}
