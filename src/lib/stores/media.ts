import { writable } from 'svelte/store';

export interface MediaFile {
	name: string;
	path: string;
	type: 'image' | 'video';
	file: File;
	url: string;
}

export const mediaFiles = writable<MediaFile[]>([]);
export const directoryName = writable<string>('');

// Retain directory entry for re-scan on recursive toggle
let _dirEntry: FileSystemDirectoryEntry | null = null;

export function setDirEntry(entry: FileSystemDirectoryEntry | null) {
	_dirEntry = entry;
}

export function getDirEntry(): FileSystemDirectoryEntry | null {
	return _dirEntry;
}

export function clearMedia() {
	mediaFiles.update((files) => {
		files.forEach((f) => URL.revokeObjectURL(f.url));
		return [];
	});
	directoryName.set('');
	_dirEntry = null;
}
