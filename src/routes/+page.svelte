<script lang="ts">
	import { FolderOpen } from 'lucide-svelte';
	import DropZone from '$lib/components/DropZone.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import MediaGrid from '$lib/components/MediaGrid.svelte';
	import MediaDialog from '$lib/components/MediaDialog.svelte';
	import { mediaFiles, directoryName, clearMedia, setDirEntry, getDirEntry, type MediaFile } from '$lib/stores/media';
	import { recursive, mediaFilter, gridSize } from '$lib/stores/preferences';
	import { processDropEvent, rescanDirectory } from '$lib/utils/fileReader';

	let dragOver = $state(false);
	let loading = $state(false);
	let selectedMedia = $state<MediaFile | null>(null);
	let dialogOpen = $state(false);

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
			const { files, dirName, dirEntry } = await processDropEvent(e.dataTransfer, $recursive);
			if (gen !== scanGeneration) {
				files.forEach((f) => URL.revokeObjectURL(f.url));
				return;
			}
			mediaFiles.set(files);
			directoryName.set(dirName);
			setDirEntry(dirEntry);
		} catch (err) {
			console.error('Drop error:', err);
		} finally {
			if (gen === scanGeneration) loading = false;
		}
	}

	async function handleRescan() {
		const entry = getDirEntry();
		if (!entry) return;

		const gen = ++scanGeneration;
		loading = true;
		dialogOpen = false;
		selectedMedia = null;

		try {
			mediaFiles.update((files) => {
				files.forEach((f) => URL.revokeObjectURL(f.url));
				return [];
			});
			const files = await rescanDirectory(entry, $recursive);
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

	// Re-scan when recursive toggle changes while a directory is loaded
	let initialMount = true;
	$effect(() => {
		const _r = $recursive;
		if (initialMount) {
			initialMount = false;
			return;
		}
		if (getDirEntry()) {
			handleRescan();
		}
	});

	function openDialog(file: MediaFile) {
		selectedMedia = file;
		dialogOpen = true;
	}

	function handleClear() {
		dialogOpen = false;
		selectedMedia = null;
		clearMedia();
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

{#if $directoryName}
	<Toolbar dirName={$directoryName} fileCount={$mediaFiles.length} onClear={handleClear} />
	{#if loading}
		<div class="flex flex-col items-center justify-center py-32 gap-3">
			<div class="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"></div>
			<p class="text-xs text-[var(--accent)]/60">再スキャン中...</p>
		</div>
	{:else if $mediaFiles.length > 0}
		<MediaGrid files={$mediaFiles} onSelect={openDialog} />
	{:else}
		<div class="flex flex-col items-center justify-center py-32 gap-3">
			<FolderOpen class="h-10 w-10 text-[var(--text-muted)]/40" strokeWidth={1} />
			<p class="text-sm text-[var(--text-muted)]">メディアファイルが見つかりません</p>
			<p class="text-xs text-[var(--text-muted)]/60">Recursive [R] を有効にして再スキャンしてください</p>
		</div>
	{/if}
{:else}
	<div class="flex h-screen flex-col items-center justify-center gap-4">
		{#if loading}
			<div class="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"></div>
			<p class="text-sm text-[var(--accent)]/60">読み込み中...</p>
		{:else}
			<div class="flex flex-col items-center gap-3">
				<FolderOpen class="h-12 w-12 text-[var(--accent-cyan)]/40" strokeWidth={1} />
				<p class="text-sm text-[var(--accent-cyan)]/60">ディレクトリをドラッグ&ドロップ</p>
				<p class="text-xs text-[var(--text-muted)]">画像・動画を一覧表示します</p>
			</div>
		{/if}
	</div>
{/if}

<MediaDialog media={selectedMedia} bind:open={dialogOpen} />
