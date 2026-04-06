import type { MediaFile } from '$lib/stores/media';

const IMAGE_EXTS = new Set([
	'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'tiff', 'tif', 'heic', 'heif'
]);

const VIDEO_EXTS = new Set([
	'mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv', 'm4v', 'flv', 'wmv', '3gp'
]);

function getMediaType(name: string): 'image' | 'video' | null {
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	if (IMAGE_EXTS.has(ext)) return 'image';
	if (VIDEO_EXTS.has(ext)) return 'video';
	return null;
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
	return new Promise((resolve, reject) => {
		reader.readEntries(resolve, reject);
	});
}

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
	const all: FileSystemEntry[] = [];
	let batch: FileSystemEntry[];
	do {
		batch = await readEntries(reader);
		all.push(...batch);
	} while (batch.length > 0);
	return all;
}

function fileEntryToFile(entry: FileSystemFileEntry): Promise<File> {
	return new Promise((resolve, reject) => {
		entry.file(resolve, reject);
	});
}

export async function readDirectory(
	entry: FileSystemDirectoryEntry,
	recursive: boolean,
	currentDepth = 0,
	basePath = ''
): Promise<MediaFile[]> {
	const maxDepth = recursive ? 2 : 0;

	const reader = entry.createReader();
	const entries = await readAllEntries(reader);
	const results: MediaFile[] = [];

	for (const child of entries) {
		if (child.name.startsWith('.')) continue;

		const childPath = basePath ? `${basePath}/${child.name}` : child.name;

		if (child.isFile) {
			const type = getMediaType(child.name);
			if (type) {
				const file = await fileEntryToFile(child as FileSystemFileEntry);
				results.push({
					name: child.name,
					path: childPath,
					type,
					file,
					url: URL.createObjectURL(file)
				});
			}
		} else if (child.isDirectory && currentDepth < maxDepth) {
			const subResults = await readDirectory(
				child as FileSystemDirectoryEntry,
				recursive,
				currentDepth + 1,
				childPath
			);
			results.push(...subResults);
		}
	}

	return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function processDropEvent(
	dataTransfer: DataTransfer,
	recursive: boolean
): Promise<{ files: MediaFile[]; dirName: string; dirEntry: FileSystemDirectoryEntry | null }> {
	const items = Array.from(dataTransfer.items);
	const allFiles: MediaFile[] = [];
	let dirName = '';
	let dirEntry: FileSystemDirectoryEntry | null = null;

	for (const item of items) {
		const entry = item.webkitGetAsEntry?.();
		if (!entry) continue;

		if (entry.isDirectory) {
			dirEntry = entry as FileSystemDirectoryEntry;
			dirName = entry.name;
			const files = await readDirectory(dirEntry, recursive);
			allFiles.push(...files);
		}
	}

	return { files: allFiles, dirName, dirEntry };
}

export async function rescanDirectory(
	entry: FileSystemDirectoryEntry,
	recursive: boolean
): Promise<MediaFile[]> {
	return readDirectory(entry, recursive);
}
