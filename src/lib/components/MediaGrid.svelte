<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import MediaCard from './MediaCard.svelte';
	import { gridSize, mediaFilter } from '$lib/stores/preferences';
	import type { MediaFile } from '$lib/stores/media';

	const BATCH_SIZE = 20;

	let { files, onSelect }: { files: MediaFile[]; onSelect: (file: MediaFile) => void } = $props();

	let gridEl: HTMLDivElement;
	let sentinelEl: HTMLDivElement;
	let averageAspect = $state(1);
	let displayCount = $state(BATCH_SIZE);
	let aspectGeneration = 0;

	const filteredFiles = $derived(
		$mediaFilter === 'all'
			? files
			: files.filter((f) => f.type === $mediaFilter)
	);

	const visibleFiles = $derived(filteredFiles.slice(0, displayCount));
	const hasMore = $derived(displayCount < filteredFiles.length);
	const loadedRatio = $derived(
		filteredFiles.length > 0
			? Math.min(displayCount, filteredFiles.length) / filteredFiles.length
			: 0
	);

	// Reset display count when filter or files change
	$effect(() => {
		$mediaFilter;
		files;
		displayCount = BATCH_SIZE;
	});

	const gridCols = $derived(
		$gridSize === 'lg'
			? 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3'
			: $gridSize === 'md'
				? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5'
				: 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8'
	);

	$effect(() => {
		if (files.length === 0) {
			averageAspect = 1;
			return;
		}
		computeAverageAspect(files);
	});

	// Infinite scroll observer - re-creates when sentinelEl or filteredFiles changes
	$effect(() => {
		if (!sentinelEl) return;
		const currentFiltered = filteredFiles;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting && displayCount < currentFiltered.length) {
					displayCount = Math.min(displayCount + BATCH_SIZE, currentFiltered.length);
				}
			},
			{ rootMargin: '400px' }
		);
		observer.observe(sentinelEl);
		return () => observer.disconnect();
	});

	async function computeAverageAspect(mediaFiles: MediaFile[]) {
		const gen = ++aspectGeneration;
		const samples = mediaFiles.slice(0, 20);
		const ratios: number[] = [];

		await Promise.all(
			samples.map(
				(m) =>
					new Promise<void>((resolve) => {
						if (m.type === 'image') {
							const img = new window.Image();
							img.onload = () => {
								if (img.naturalHeight > 0) {
									ratios.push(img.naturalWidth / img.naturalHeight);
								}
								img.src = '';
								resolve();
							};
							img.onerror = () => { img.src = ''; resolve(); };
							img.src = m.url;
						} else {
							const video = document.createElement('video');
							video.onloadedmetadata = () => {
								if (video.videoHeight > 0) {
									ratios.push(video.videoWidth / video.videoHeight);
								}
								video.src = '';
								video.load();
								resolve();
							};
							video.onerror = () => { video.src = ''; resolve(); };
							video.src = m.url;
						}
					})
			)
		);

		if (gen !== aspectGeneration) return;

		if (ratios.length > 0) {
			averageAspect = ratios.reduce((a, b) => a + b, 0) / ratios.length;
		}
	}

	function getCards(): HTMLButtonElement[] {
		if (!gridEl) return [];
		return Array.from(gridEl.querySelectorAll<HTMLButtonElement>(':scope > button'));
	}

	function getColCount(): number {
		if (!gridEl) return 1;
		const cards = getCards();
		if (cards.length < 2) return 1;
		const firstTop = cards[0].getBoundingClientRect().top;
		let cols = 1;
		for (let i = 1; i < cards.length; i++) {
			if (Math.abs(cards[i].getBoundingClientRect().top - firstTop) < 2) cols++;
			else break;
		}
		return cols;
	}

	function handleGridKeydown(e: KeyboardEvent) {
		const cards = getCards();
		if (cards.length === 0) return;

		const active = document.activeElement as HTMLElement;
		const currentIndex = cards.indexOf(active as HTMLButtonElement);
		if (currentIndex === -1) return;

		let nextIndex = -1;
		const cols = getColCount();

		switch (e.key) {
			case 'ArrowRight':
				nextIndex = Math.min(currentIndex + 1, cards.length - 1);
				break;
			case 'ArrowLeft':
				nextIndex = Math.max(currentIndex - 1, 0);
				break;
			case 'ArrowDown':
				nextIndex = Math.min(currentIndex + cols, cards.length - 1);
				break;
			case 'ArrowUp':
				nextIndex = Math.max(currentIndex - cols, 0);
				break;
			default:
				return;
		}

		if (nextIndex !== -1 && nextIndex !== currentIndex) {
			e.preventDefault();
			cards[nextIndex].focus();
			cards[nextIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	}
</script>

<!-- Progress bar for large sets -->
{#if filteredFiles.length > BATCH_SIZE && hasMore}
	<div class="sticky top-[41px] z-30 h-0.5 w-full bg-[var(--surface-2)]">
		<div
			class="h-full bg-[var(--accent)] transition-all duration-300 ease-out"
			style="width: {loadedRatio * 100}%"
		></div>
	</div>
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={gridEl}
	class="grid {gridCols} gap-1 p-2"
	style="--aspect: {averageAspect.toFixed(3)}"
	role="grid"
	aria-label="メディアグリッド"
	onkeydown={handleGridKeydown}
>
	{#each visibleFiles as file, i (file.url)}
		<MediaCard
			media={file}
			index={i}
			onclick={() => onSelect(file)}
			tabindex={i === 0 ? 0 : -1}
		/>
	{/each}
</div>

<!-- Infinite scroll sentinel -->
{#if hasMore}
	<div bind:this={sentinelEl} class="flex items-center justify-center gap-2 py-6">
		<Loader2 class="h-4 w-4 animate-spin text-[var(--accent-cyan)]/50" />
		<span class="text-xs text-[var(--text-muted)]">
			{visibleFiles.length} / {filteredFiles.length}
		</span>
	</div>
{/if}

{#if filteredFiles.length === 0 && files.length > 0}
	<div class="flex items-center justify-center py-20 text-sm text-[var(--text-muted)]">
		該当するメディアがありません
	</div>
{/if}
