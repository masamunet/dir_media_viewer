<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import MediaCard from './MediaCard.svelte';
	import { gridSize, mediaFilter } from '$lib/stores/preferences';
	import type { MediaFile } from '$lib/stores/media';

	const BATCH_SIZE = 20;
	const ASPECT_IMAGE_SAMPLE_SIZE = 12;
	const ASPECT_VIDEO_SAMPLE_SIZE = 3;
	const ASPECT_SAMPLE_TIMEOUT_MS = 2500;

	let { files, onSelect }: { files: MediaFile[]; onSelect: (file: MediaFile) => void } = $props();

	let gridEl: HTMLDivElement;
	let sentinelEl: HTMLDivElement | undefined = $state();
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
		const imageSamples = mediaFiles.filter((m) => m.type === 'image').slice(0, ASPECT_IMAGE_SAMPLE_SIZE);
		const videoSamples = mediaFiles.filter((m) => m.type === 'video').slice(0, ASPECT_VIDEO_SAMPLE_SIZE);
		const samples = [...imageSamples, ...videoSamples];
		const ratios: number[] = [];

		for (const sample of samples) {
			if (gen !== aspectGeneration) return;
			const ratio = sample.type === 'image'
				? await readImageAspect(sample.url)
				: await readVideoAspect(sample.url);
			if (ratio) ratios.push(ratio);
		}

		if (gen !== aspectGeneration) return;

		if (ratios.length > 0) {
			averageAspect = ratios.reduce((a, b) => a + b, 0) / ratios.length;
		}
	}

	function readImageAspect(url: string) {
		return new Promise<number | null>((resolve) => {
			const img = new window.Image();
			let done = false;
			const timer = window.setTimeout(() => cleanup(null), ASPECT_SAMPLE_TIMEOUT_MS);

			function cleanup(ratio: number | null) {
				if (done) return;
				done = true;
				window.clearTimeout(timer);
				img.onload = null;
				img.onerror = null;
				img.src = '';
				resolve(ratio);
			}

			img.onload = () => cleanup(img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null);
			img.onerror = () => cleanup(null);
			img.src = url;
		});
	}

	function readVideoAspect(url: string) {
		return new Promise<number | null>((resolve) => {
			const video = document.createElement('video');
			let done = false;
			const timer = window.setTimeout(() => cleanup(null), ASPECT_SAMPLE_TIMEOUT_MS);

			function cleanup(ratio: number | null) {
				if (done) return;
				done = true;
				window.clearTimeout(timer);
				video.onloadedmetadata = null;
				video.onerror = null;
				video.removeAttribute('src');
				video.load();
				resolve(ratio);
			}

			video.preload = 'metadata';
			video.muted = true;
			video.playsInline = true;
			video.onloadedmetadata = () => cleanup(video.videoHeight > 0 ? video.videoWidth / video.videoHeight : null);
			video.onerror = () => cleanup(null);
			video.src = url;
		});
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
	tabindex="-1"
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
