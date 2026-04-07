import type { MediaFile } from '$lib/stores/media';
import type { TreeNode } from '$lib/stores/directoryTree';

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

// --- File System Access API (showDirectoryPicker) ---

async function readDirectoryHandle(
	handle: FileSystemDirectoryHandle,
	recursive: boolean,
	currentDepth = 0,
	basePath = ''
): Promise<MediaFile[]> {
	const maxDepth = recursive ? 2 : 0;
	const results: MediaFile[] = [];

	for await (const [name, childHandle] of handle.entries()) {
		if (name.startsWith('.')) continue;

		const childPath = basePath ? `${basePath}/${name}` : name;

		if (childHandle.kind === 'file') {
			const type = getMediaType(name);
			if (type) {
				const file = await childHandle.getFile();
				results.push({
					name,
					path: childPath,
					type,
					file,
					url: URL.createObjectURL(file)
				});
			}
		} else if (childHandle.kind === 'directory' && currentDepth < maxDepth) {
			const subResults = await readDirectoryHandle(
				childHandle,
				recursive,
				currentDepth + 1,
				childPath
			);
			results.push(...subResults);
		}
	}

	return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function pickDirectory(
	recursive: boolean
): Promise<{ files: MediaFile[]; dirName: string; dirHandle: FileSystemDirectoryHandle } | null> {
	if (!('showDirectoryPicker' in window)) return null;

	try {
		const dirHandle = await window.showDirectoryPicker();
		const files = await readDirectoryHandle(dirHandle, recursive);
		return { files, dirName: dirHandle.name, dirHandle };
	} catch (e) {
		// User cancelled the picker
		if (e instanceof DOMException && e.name === 'AbortError') return null;
		throw e;
	}
}

export async function rescanDirectoryHandle(
	handle: FileSystemDirectoryHandle,
	recursive: boolean
): Promise<MediaFile[]> {
	return readDirectoryHandle(handle, recursive);
}

// --- Directory Tree scanning (directories only, unlimited depth) ---

export async function scanDirectoryTreeFromEntry(
	entry: FileSystemDirectoryEntry,
	basePath = ''
): Promise<TreeNode> {
	const reader = entry.createReader();
	const entries = await readAllEntries(reader);
	const children: TreeNode[] = [];

	for (const child of entries) {
		if (child.name.startsWith('.')) continue;
		if (!child.isDirectory) continue;

		const childPath = basePath ? `${basePath}/${child.name}` : child.name;
		const childNode = await scanDirectoryTreeFromEntry(
			child as FileSystemDirectoryEntry,
			childPath
		);
		children.push(childNode);
	}

	children.sort((a, b) => a.name.localeCompare(b.name));

	return {
		name: entry.name,
		path: basePath,
		children,
		isExpanded: basePath === '', // root starts expanded
		dirEntry: entry
	};
}

export async function scanDirectoryTreeFromHandle(
	handle: FileSystemDirectoryHandle,
	basePath = ''
): Promise<TreeNode> {
	const children: TreeNode[] = [];

	for await (const [name, childHandle] of handle.entries()) {
		if (name.startsWith('.')) continue;
		if (childHandle.kind !== 'directory') continue;

		const childPath = basePath ? `${basePath}/${name}` : name;
		const childNode = await scanDirectoryTreeFromHandle(
			childHandle,
			childPath
		);
		children.push(childNode);
	}

	children.sort((a, b) => a.name.localeCompare(b.name));

	return {
		name: handle.name,
		path: basePath,
		children,
		isExpanded: basePath === '',
		dirHandle: handle
	};
}

// --- Shallow (single-level) file reading ---

export async function readDirectoryShallowEntry(
	entry: FileSystemDirectoryEntry
): Promise<MediaFile[]> {
	const reader = entry.createReader();
	const entries = await readAllEntries(reader);
	const results: MediaFile[] = [];

	for (const child of entries) {
		if (child.name.startsWith('.')) continue;
		if (!child.isFile) continue;

		const type = getMediaType(child.name);
		if (type) {
			const file = await fileEntryToFile(child as FileSystemFileEntry);
			results.push({
				name: child.name,
				path: child.name,
				type,
				file,
				url: URL.createObjectURL(file)
			});
		}
	}

	return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readDirectoryShallowHandle(
	handle: FileSystemDirectoryHandle
): Promise<MediaFile[]> {
	const results: MediaFile[] = [];

	for await (const [name, childHandle] of handle.entries()) {
		if (name.startsWith('.')) continue;
		if (childHandle.kind !== 'file') continue;

		const type = getMediaType(name);
		if (type) {
			const file = await childHandle.getFile();
			results.push({
				name,
				path: name,
				type,
				file,
				url: URL.createObjectURL(file)
			});
		}
	}

	return results.sort((a, b) => a.name.localeCompare(b.name));
}
