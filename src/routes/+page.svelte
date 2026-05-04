<script lang="ts">
	import { FolderOpen, MousePointerClick } from 'lucide-svelte';
	import DropZone from '$lib/components/DropZone.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import MediaGrid from '$lib/components/MediaGrid.svelte';
	import MediaDialog from '$lib/components/MediaDialog.svelte';
	import DirectoryDrawer from '$lib/components/DirectoryDrawer.svelte';
	import {
		mediaFiles, directoryName, clearMedia,
		setDirEntry, getDirEntry,
		setDirHandle, getDirHandle, getDirSource,
		type MediaFile
	} from '$lib/stores/media';
	import { recursive, mediaFilter, gridSize } from '$lib/stores/preferences';
	import {
		processDropEvent, rescanDirectory, pickDirectory, rescanDirectoryHandle,
		scanDirectoryTreeFromEntry, scanDirectoryTreeFromHandle,
		readDirectoryShallowEntry, readDirectoryShallowHandle
	} from '$lib/utils/fileReader';
	import {
		drawerOpen, treeRoot, cursorPath, selectedPath, treeFiles,
		findNode, resetTree, collapseNode,
		moveCursorUp, moveCursorDown, moveCursorToParent, moveCursorToChild, openNode
	} from '$lib/stores/directoryTree';

	let dragOver = $state(false);
	let loading = $state(false);
	let selectedMedia = $state<MediaFile | null>(null);
	let dialogOpen = $state(false);

	// When tree mode is active, show tree-selected files (even if drawer is closed)
	const displayFiles = $derived($treeRoot ? $treeFiles : $mediaFiles);

	const filteredFiles = $derived(
		$mediaFilter === 'all'
			? displayFiles
			: displayFiles.filter((f) => f.type === $mediaFilter)
	);
	const videoOnlyDisplay = $derived(
		filteredFiles.length > 0 && filteredFiles.every((f) => f.type === 'video')
	);

	let dragCounter = 0;
	let scanGeneration = 0;

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		dragCounter++;
		dragOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		dragCounter--;
		if (dragCounter <= 0) {
			dragCounter = 0;
			dragOver = false;
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragCounter = 0;
		dragOver = false;

		if (!e.dataTransfer) return;

		const gen = ++scanGeneration;
		loading = true;
		dialogOpen = false;
		selectedMedia = null;

		try {
			clearMedia();
			resetTree();
			const { files, dirName, dirEntry } = await processDropEvent(e.dataTransfer, $recursive);
			if (gen !== scanGeneration) {
				files.forEach((f) => URL.revokeObjectURL(f.url));
				return;
			}
			directoryName.set(dirName);
			setDirEntry(dirEntry);

			// Build directory tree and open drawer
			if (dirEntry) {
				// Tree mode: revoke flat mediaFiles (not displayed in tree mode)
				files.forEach((f) => URL.revokeObjectURL(f.url));
				mediaFiles.set([]);

				const tree = await scanDirectoryTreeFromEntry(dirEntry);
				if (gen !== scanGeneration) return;
				treeRoot.set(tree);
				cursorPath.set(tree.path);
				selectedPath.set(tree.path);
				drawerOpen.set(true);
				// Load root's shallow files
				const shallowFiles = await readDirectoryShallowEntry(dirEntry);
				if (gen !== scanGeneration) {
					shallowFiles.forEach((f) => URL.revokeObjectURL(f.url));
					return;
				}
				treeFiles.set(shallowFiles);
			} else {
				mediaFiles.set(files);
			}
		} catch (err) {
			console.error('Drop error:', err);
		} finally {
			if (gen === scanGeneration) loading = false;
		}
	}

	async function handlePickDirectory() {
		const gen = ++scanGeneration;
		loading = true;
		dialogOpen = false;
		selectedMedia = null;

		try {
			clearMedia();
			resetTree();
			const result = await pickDirectory($recursive);
			if (!result || gen !== scanGeneration) {
				result?.files.forEach((f) => URL.revokeObjectURL(f.url));
				if (gen === scanGeneration) loading = false;
				return;
			}
			directoryName.set(result.dirName);
			setDirHandle(result.dirHandle);

			// Tree mode: revoke flat mediaFiles (not displayed in tree mode)
			result.files.forEach((f) => URL.revokeObjectURL(f.url));
			mediaFiles.set([]);

			// Build directory tree and open drawer
			const tree = await scanDirectoryTreeFromHandle(result.dirHandle);
			if (gen !== scanGeneration) return;
			treeRoot.set(tree);
			cursorPath.set(tree.path);
			selectedPath.set(tree.path);
			drawerOpen.set(true);
			// Load root's shallow files
			const shallowFiles = await readDirectoryShallowHandle(result.dirHandle);
			if (gen !== scanGeneration) {
				shallowFiles.forEach((f) => URL.revokeObjectURL(f.url));
				return;
			}
			treeFiles.set(shallowFiles);
		} catch (err) {
			console.error('Pick error:', err);
		} finally {
			if (gen === scanGeneration) loading = false;
		}
	}

	async function handleRescan() {
		const source = getDirSource();
		if (!source) return;

		const gen = ++scanGeneration;
		loading = true;
		dialogOpen = false;
		selectedMedia = null;

		try {
			mediaFiles.update((files) => {
				files.forEach((f) => URL.revokeObjectURL(f.url));
				return [];
			});

			let files: MediaFile[];
			if (source === 'entry') {
				files = await rescanDirectory(getDirEntry()!, $recursive);
			} else {
				files = await rescanDirectoryHandle(getDirHandle()!, $recursive);
			}

			if (gen !== scanGeneration) {
				files.forEach((f) => URL.revokeObjectURL(f.url));
				return;
			}
			mediaFiles.set(files);
		} catch (err) {
			console.error('Rescan error:', err);
		} finally {
			if (gen === scanGeneration) loading = false;
		}
	}

	// Load files when selected tree node changes
	let treeFileGeneration = 0;
	$effect(() => {
		const path = $selectedPath;
		const root = $treeRoot;
		const isOpen = $drawerOpen;
		if (!isOpen || !root) return;

		const node = findNode(root, path);
		if (!node) return;

		const gen = ++treeFileGeneration;

		async function loadShallowFiles() {
			// Revoke previous files immediately to limit blob URL accumulation
			treeFiles.update((old) => {
				old.forEach((f) => URL.revokeObjectURL(f.url));
				return [];
			});
			try {
				let files: MediaFile[];
				if (node!.dirEntry) {
					files = await readDirectoryShallowEntry(node!.dirEntry);
				} else if (node!.dirHandle) {
					files = await readDirectoryShallowHandle(node!.dirHandle);
				} else {
					return;
				}
				if (gen !== treeFileGeneration) {
					files.forEach((f) => URL.revokeObjectURL(f.url));
					return;
				}
				treeFiles.set(files);
			} catch (err) {
				console.error('Shallow read error:', err);
			}
		}

		loadShallowFiles();
	});

	// Re-scan when recursive toggle changes while a directory is loaded
	let initialMount = true;
	$effect(() => {
		const _r = $recursive;
		if (initialMount) {
			initialMount = false;
			return;
		}
		// Recursive toggle only applies in flat mode (not tree mode)
		if (getDirSource() && !$treeRoot) {
			handleRescan();
		}
	});

	function navigateDialog(direction: 1 | -1) {
		if (!selectedMedia || filteredFiles.length === 0) return false;
		const idx = filteredFiles.findIndex((f) => f.path === selectedMedia!.path);
		if (idx === -1) return false;
		const next = idx + direction;
		if (next < 0 || next >= filteredFiles.length) return false;
		selectedMedia = filteredFiles[next];
		return true;
	}

	function handleDialogVideoEnded() {
		if (!videoOnlyDisplay || selectedMedia?.type !== 'video') return;
		navigateDialog(1);
	}

	// ダイアログ表示中のキーボード操作（captureフェーズで確実にキャッチ）
	$effect(() => {
		function onKeydown(e: KeyboardEvent) {
			if (!dialogOpen) return;
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

			switch (e.key) {
				case 'ArrowLeft':
				case 'h':
					e.preventDefault();
					e.stopImmediatePropagation();
					navigateDialog(-1);
					break;
				case 'ArrowRight':
				case 'l':
					e.preventDefault();
					e.stopImmediatePropagation();
					navigateDialog(1);
					break;
				case 'Escape':
					e.preventDefault();
					e.stopImmediatePropagation();
					dialogOpen = false;
					break;
				case ' ':
					e.preventDefault();
					e.stopImmediatePropagation();
					dialogOpen = false;
					break;
			}
		}
		window.addEventListener('keydown', onKeydown, true);
		return () => window.removeEventListener('keydown', onKeydown, true);
	});

	// --- Double-Shift detection for drawer toggle ---
	type ShiftState = 'idle' | 'shift_down' | 'shift_released';
	let shiftState: ShiftState = 'idle';
	let shiftTimer: ReturnType<typeof setTimeout> | null = null;
	let shiftComboUsed = false;

	// --- Tree navigation (only active when drawer is open) ---
	$effect(() => {
		function onTreeKeydown(e: KeyboardEvent) {
			if (dialogOpen) return;
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

			// --- Double-Shift: track Shift keydown regardless of drawer state ---
			if (e.key === 'Shift') {
				if (shiftState === 'shift_released' && $treeRoot) {
					// Second Shift within timeout → double-Shift toggle
					if (shiftTimer) { clearTimeout(shiftTimer); shiftTimer = null; }
					shiftState = 'idle';
					drawerOpen.update((v) => !v);
					e.preventDefault();
					return;
				}
				// Defensively clear any residual timer
				if (shiftTimer) { clearTimeout(shiftTimer); shiftTimer = null; }
				shiftState = 'shift_down';
				shiftComboUsed = false;
				return;
			}

			// Everything below only applies when drawer is open
			if (!$drawerOpen) return;

			// Space: open cursor node (view mode)
			if (e.key === ' ' && !e.shiftKey) {
				e.preventDefault();
				e.stopImmediatePropagation();
				openNode();
				return;
			}

			// Mark any Shift combo as used (so Shift keyup won't fire parent move)
			if (e.shiftKey) {
				shiftComboUsed = true;
			}

			// Arrow keys for tree navigation
			if (e.ctrlKey || e.metaKey || e.altKey) return;

			switch (e.key) {
				case 'ArrowUp':
					e.preventDefault();
					e.stopImmediatePropagation();
					moveCursorUp();
					break;
				case 'ArrowDown':
					e.preventDefault();
					e.stopImmediatePropagation();
					moveCursorDown();
					break;
				case 'ArrowLeft': {
					e.preventDefault();
					e.stopImmediatePropagation();
					const root = $treeRoot;
					const node = findNode(root, $cursorPath);
					if (node && node.isExpanded && node.children.length > 0) {
						collapseNode(node.path);
					} else {
						moveCursorToParent();
					}
					break;
				}
				case 'ArrowRight':
					e.preventDefault();
					e.stopImmediatePropagation();
					moveCursorToChild();
					break;
			}
		}

		function onTreeKeyup(e: KeyboardEvent) {
			if (e.key !== 'Shift') return;
			if (dialogOpen) { shiftState = 'idle'; return; }

			if (shiftState === 'shift_down' && !shiftComboUsed) {
				// Shift released alone → wait for possible double-Shift
				shiftState = 'shift_released';
				shiftTimer = setTimeout(() => {
					// Timer expired → single Shift (move cursor to parent if drawer open)
					if ($drawerOpen) {
						moveCursorToParent();
					}
					shiftState = 'idle';
					shiftTimer = null;
				}, 300);
			} else {
				shiftState = 'idle';
			}
		}

		window.addEventListener('keydown', onTreeKeydown, true);
		window.addEventListener('keyup', onTreeKeyup, true);
		return () => {
			window.removeEventListener('keydown', onTreeKeydown, true);
			window.removeEventListener('keyup', onTreeKeyup, true);
			if (shiftTimer) clearTimeout(shiftTimer);
		};
	});

	function openDialog(file: MediaFile) {
		selectedMedia = file;
		dialogOpen = true;
	}

	function handleClear() {
		dialogOpen = false;
		selectedMedia = null;
		clearMedia();
		resetTree();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (dialogOpen) return;
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;

		switch (e.key) {
			case 'r':
			case 'R':
				e.preventDefault();
				recursive.update((v) => !v);
				break;
			case 'a':
			case 'A':
				e.preventDefault();
				mediaFilter.set('all');
				break;
			case 'i':
			case 'I':
				e.preventDefault();
				mediaFilter.set('image');
				break;
			case 'v':
			case 'V':
				e.preventDefault();
				mediaFilter.set('video');
				break;
			case '1':
				e.preventDefault();
				gridSize.set('lg');
				break;
			case '2':
				e.preventDefault();
				gridSize.set('md');
				break;
			case '3':
				e.preventDefault();
				gridSize.set('sm');
				break;
			case 'Escape':
				if ($directoryName) {
					e.preventDefault();
					handleClear();
				}
				break;
		}
	}
</script>

<svelte:document
	ondragenter={handleDragEnter}
	ondragleave={handleDragLeave}
	ondragover={handleDragOver}
	ondrop={handleDrop}
	onkeydown={handleKeydown}
/>

<DropZone active={dragOver} />
<DirectoryDrawer open={$drawerOpen} root={$treeRoot} />

{#if $directoryName}
	<div style="margin-left: {$drawerOpen ? 'var(--drawer-width)' : '0'}; transition: margin-left 0.2s ease">
		<Toolbar
			dirName={$directoryName}
			fileCount={displayFiles.length}
			onClear={handleClear}
			treePath={$drawerOpen ? ($selectedPath || '.') : ''}
			hasTree={!!$treeRoot}
			drawerOpen={$drawerOpen}
			onToggleDrawer={() => drawerOpen.update(v => !v)}
		/>
		{#if loading}
			<div class="flex flex-col items-center justify-center py-32 gap-3">
				<div class="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"></div>
				<p class="text-xs text-[var(--accent)]/60">再スキャン中...</p>
			</div>
		{:else if filteredFiles.length > 0}
			<MediaGrid files={filteredFiles} onSelect={openDialog} />
		{:else}
			<div class="flex flex-col items-center justify-center py-32 gap-3">
				<FolderOpen class="h-10 w-10 text-[var(--text-muted)]/40" strokeWidth={1} />
				<p class="text-sm text-[var(--text-muted)]">メディアファイルが見つかりません</p>
				<p class="text-xs text-[var(--text-muted)]/60">Recursive [R] を有効にして再スキャンしてください</p>
			</div>
		{/if}
	</div>
{:else}
	<div class="flex h-screen flex-col items-center justify-center gap-4">
		{#if loading}
			<div class="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"></div>
			<p class="text-sm text-[var(--accent)]/60">読み込み中...</p>
		{:else}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="flex flex-col items-center gap-5 cursor-pointer select-none"
				onclick={handlePickDirectory}
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePickDirectory(); }}
				role="button"
				tabindex={0}
			>
				<FolderOpen class="h-14 w-14 text-[var(--accent-cyan)]/60 transition-colors group-hover:text-[var(--accent-cyan)]" strokeWidth={1} />
				<div class="flex flex-col items-center gap-1">
					<p class="text-sm text-[var(--accent-cyan)]/80">ディレクトリをドラッグ&ドロップ</p>
					<div class="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
						<MousePointerClick class="h-3 w-3" />
						<span>クリックで選択</span>
					</div>
				</div>
				<p class="text-xs text-[var(--text-muted)]">画像・動画を一覧表示します</p>
			</div>
		{/if}
	</div>
{/if}

<MediaDialog
	media={selectedMedia}
	bind:open={dialogOpen}
	advanceOnVideoEnd={videoOnlyDisplay}
	onVideoEnded={handleDialogVideoEnded}
/>
