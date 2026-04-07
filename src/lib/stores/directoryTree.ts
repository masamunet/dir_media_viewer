import { writable, get } from 'svelte/store';
import type { MediaFile } from '$lib/stores/media';

export interface TreeNode {
	name: string;
	path: string; // '' for root, 'sub' for first level, 'sub/child' for deeper
	children: TreeNode[];
	isExpanded: boolean;
	dirEntry?: FileSystemDirectoryEntry;
	dirHandle?: FileSystemDirectoryHandle;
}

export const drawerOpen = writable<boolean>(false);
export const treeRoot = writable<TreeNode | null>(null);
export const cursorPath = writable<string>('');
export const selectedPath = writable<string>('');
export const treeFiles = writable<MediaFile[]>([]);

/** Flatten tree into display order respecting expanded state */
export function getVisibleNodes(root: TreeNode | null): TreeNode[] {
	if (!root) return [];
	const result: TreeNode[] = [root];
	if (root.isExpanded) {
		for (const child of root.children) {
			result.push(...getVisibleNodes(child));
		}
	}
	return result;
}

/** Find a node by path in tree */
export function findNode(root: TreeNode | null, path: string): TreeNode | null {
	if (!root) return null;
	if (root.path === path) return root;
	for (const child of root.children) {
		const found = findNode(child, path);
		if (found) return found;
	}
	return null;
}

/** Find parent node of a given path */
export function findParentNode(root: TreeNode | null, path: string): TreeNode | null {
	if (!root) return null;
	for (const child of root.children) {
		if (child.path === path) return root;
		const found = findParentNode(child, path);
		if (found) return found;
	}
	return null;
}

/** Deep clone tree to trigger Svelte reactivity */
function cloneTree(node: TreeNode): TreeNode {
	return {
		...node,
		children: node.children.map(cloneTree)
	};
}

export function expandNode(path: string) {
	treeRoot.update((root) => {
		if (!root) return root;
		const cloned = cloneTree(root);
		const node = findNode(cloned, path);
		if (node) node.isExpanded = true;
		return cloned;
	});
}

export function collapseNode(path: string) {
	treeRoot.update((root) => {
		if (!root) return root;
		const cloned = cloneTree(root);
		const node = findNode(cloned, path);
		if (node) node.isExpanded = false;
		return cloned;
	});
}

export function moveCursorUp() {
	const root = get(treeRoot);
	const current = get(cursorPath);
	const visible = getVisibleNodes(root);
	const idx = visible.findIndex((n) => n.path === current);
	if (idx > 0) {
		cursorPath.set(visible[idx - 1].path);
	}
}

export function moveCursorDown() {
	const root = get(treeRoot);
	const current = get(cursorPath);
	const visible = getVisibleNodes(root);
	const idx = visible.findIndex((n) => n.path === current);
	if (idx >= 0 && idx < visible.length - 1) {
		cursorPath.set(visible[idx + 1].path);
	}
}

export function moveCursorToParent() {
	const root = get(treeRoot);
	const current = get(cursorPath);
	// Already at root
	if (current === '' || current === root?.path) return;
	const parent = findParentNode(root, current);
	if (parent) {
		cursorPath.set(parent.path);
	}
}

/** Move cursor to first child (expand if needed) */
export function moveCursorToChild() {
	const current = get(cursorPath);
	// Expand first (triggers clone), then read fresh tree for child path
	const rootBefore = get(treeRoot);
	const nodeBefore = findNode(rootBefore, current);
	if (!nodeBefore || nodeBefore.children.length === 0) return;
	const firstChildPath = nodeBefore.children[0].path;
	if (!nodeBefore.isExpanded) {
		expandNode(current);
	}
	cursorPath.set(firstChildPath);
}

/** Open a node: select it (show files in grid) + expand its children */
export function openNode(path?: string) {
	const target = path ?? get(cursorPath);
	selectedPath.set(target);
	expandNode(target);
}

/** @deprecated Use openNode() instead */
export const openCursorNode = openNode;

export function resetTree() {
	treeFiles.update((files) => {
		files.forEach((f) => URL.revokeObjectURL(f.url));
		return [];
	});
	treeRoot.set(null);
	cursorPath.set('');
	selectedPath.set('');
	drawerOpen.set(false);
}
