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

// Retain directory references for re-scan on recursive toggle
let _dirEntry: FileSystemDirectoryEntry | null = null;
let _dirHandle: FileSystemDirectoryHandle | null = null;

export type DirSource = 'entry' | 'handle' | null;

export function setDirEntry(entry: FileSystemDirectoryEntry | null) {
	_dirEntry = entry;
	if (entry) _dirHandle = null;
}

export function getDirEntry(): FileSystemDirectoryEntry | null {
	return _dirEntry;
}

export function setDirHandle(handle: FileSystemDirectoryHandle | null) {
	_dirHandle = handle;
	if (handle) _dirEntry = null;
}

export function getDirHandle(): FileSystemDirectoryHandle | null {
	return _dirHandle;
}

export function getDirSource(): DirSource {
	if (_dirEntry) return 'entry';
	if (_dirHandle) return 'handle';
	return null;
}

export function clearMedia() {
	mediaFiles.update((files) => {
		files.forEach((f) => URL.revokeObjectURL(f.url));
		return [];
	});
	directoryName.set('');
	_dirEntry = null;
	_dirHandle = null;
}
