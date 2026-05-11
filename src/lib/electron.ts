import { MAX_FILE_SIZE } from '$lib/constants';

export interface ElectronAPI {
	selectExportPath: (
		mediaType: string,
		defaultFilename: string
	) => Promise<{ canceled: boolean; token?: string; filePath?: string }>;
	writeExportedMedia: (
		token: string,
		arrayBuffer: ArrayBuffer,
		mediaType: string
	) => Promise<{ filePath: string }>;
}

declare global {
	interface Window {
		electronAPI?: ElectronAPI;
	}
}

export function isElectron(): boolean {
	return typeof window !== 'undefined' && !!window.electronAPI;
}

export async function exportMediaElectron(
	file: File,
	mediaType: string,
	defaultFilename: string
): Promise<{ canceled: boolean; filePath?: string }> {
	if (typeof window === 'undefined') {
		throw new Error('exportMediaElectron requires a browser context');
	}
	if (mediaType !== 'image' && mediaType !== 'video') {
		throw new Error('Invalid media type');
	}
	if (file.size > MAX_FILE_SIZE) {
		throw new Error('File too large');
	}
	const api = window.electronAPI;
	if (!api) throw new Error('Electron API not available');

	const selection = await api.selectExportPath(mediaType, defaultFilename);
	if (selection.canceled) return { canceled: true };
	if (!selection.token) throw new Error('Export destination missing');

	const arrayBuffer = await file.arrayBuffer();
	const result = await api.writeExportedMedia(selection.token, arrayBuffer, mediaType);
	return { canceled: false, filePath: result.filePath };
}
