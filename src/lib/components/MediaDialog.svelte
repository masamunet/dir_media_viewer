<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { X, Download, Maximize, Minimize, Loader2 } from 'lucide-svelte';
	import { dialogSize } from '$lib/stores/preferences';
	import { isElectron, convertMediaElectron } from '$lib/electron';
	import type { MediaFile } from '$lib/stores/media';

	let {
		media,
		open = $bindable(false),
		advanceOnVideoEnd = false,
		onVideoEnded
	}: {
		media: MediaFile | null;
		open: boolean;
		advanceOnVideoEnd?: boolean;
		onVideoEnded?: () => void;
	} = $props();

	let converting = $state(false);
	let mediaAreaEl: HTMLDivElement | undefined = $state();
	let mediaAreaWidth = $state(0);
	let mediaAreaHeight = $state(0);
	let mediaNaturalWidth = $state(0);
	let mediaNaturalHeight = $state(0);

	const fitMediaStyle = $derived.by(() => {
		if (
			$dialogSize !== 'fit' ||
			mediaAreaWidth <= 0 ||
			mediaAreaHeight <= 0 ||
			mediaNaturalWidth <= 0 ||
			mediaNaturalHeight <= 0
		) {
			return '';
		}

		const mediaAspect = mediaNaturalWidth / mediaNaturalHeight;
		const areaAspect = mediaAreaWidth / mediaAreaHeight;
		let width = mediaAreaWidth;
		let height = mediaAreaHeight;

		if (areaAspect > mediaAspect) {
			width = height * mediaAspect;
		} else {
			height = width / mediaAspect;
		}

		return `width: ${width}px; height: ${height}px;`;
	});

	$effect(() => {
		media;
		mediaNaturalWidth = 0;
		mediaNaturalHeight = 0;
	});

	$effect(() => {
		const el = mediaAreaEl;
		if (!el) return;

		function updateMediaArea(target: HTMLDivElement) {
			const rect = target.getBoundingClientRect();
			mediaAreaWidth = rect.width;
			mediaAreaHeight = rect.height;
		}

		updateMediaArea(el);
		const observer = new ResizeObserver(() => updateMediaArea(el));
		observer.observe(el);
		return () => observer.disconnect();
	});

	function triggerDownload(blob: Blob, baseName: string, ext: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${baseName}.${ext}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	async function handleConvert() {
		if (!media) return;
		converting = true;

		try {
			const ext = media.type === 'video' ? 'mp4' : 'jpg';
			const baseName = media.name.replace(/\.[^.]+$/, '');
			let blob: Blob;

			if (isElectron()) {
				blob = await convertMediaElectron(media.file, media.type);
			} else {
				const formData = new FormData();
				formData.append('file', media.file);
				formData.append('type', media.type);
				const res = await fetch('/api/convert', { method: 'POST', body: formData });
				if (!res.ok) throw new Error('Conversion failed');
				blob = await res.blob();
			}

			triggerDownload(blob, baseName, ext);
		} catch (e) {
			console.error('Convert error:', e);
		} finally {
			converting = false;
		}
	}

	function handleVideoEnded() {
		onVideoEnded?.();
	}

	function handleImageLoad(event: Event) {
		const img = event.currentTarget as HTMLImageElement;
		mediaNaturalWidth = img.naturalWidth;
		mediaNaturalHeight = img.naturalHeight;
	}

	function handleVideoMetadata(event: Event) {
		const video = event.currentTarget as HTMLVideoElement;
		mediaNaturalWidth = video.videoWidth;
		mediaNaturalHeight = video.videoHeight;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<Dialog.Overlay
			class="fixed inset-0 z-50 cursor-pointer bg-[var(--surface-0)]/85 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
			onclick={() => (open = false)}
		/>
		<Dialog.Content
			class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-2 focus-visible:outline-none sm:p-4"
		>
			{#if media}
				<div class="relative flex h-full w-full max-h-full max-w-full flex-col items-center justify-center pt-10">
					<div class="pointer-events-auto absolute right-0 top-0 flex items-center gap-1">
						<button
							class="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--accent-cyan)]"
							onclick={() => dialogSize.update((v) => (v === 'fit' ? 'original' : 'fit'))}
							title={$dialogSize === 'fit' ? '原寸表示' : 'フィット表示'}
						>
							{#if $dialogSize === 'fit'}
								<Maximize class="h-4 w-4" />
							{:else}
								<Minimize class="h-4 w-4" />
							{/if}
						</button>

						<button
							class="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--accent)] disabled:opacity-40"
							onclick={handleConvert}
							disabled={converting}
							title="メタデータ除去して変換ダウンロード"
						>
							{#if converting}
								<Loader2 class="h-3.5 w-3.5 animate-spin" />
							{:else}
								<Download class="h-3.5 w-3.5" />
							{/if}
							<span>{media.type === 'video' ? 'MP4' : 'JPEG'}</span>
						</button>

						<Dialog.Close
							class="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--accent-alt)]"
						>
							<X class="h-4 w-4" />
						</Dialog.Close>
					</div>

					<div bind:this={mediaAreaEl} class="flex min-h-0 w-full flex-1 items-center justify-center">
						{#if media.type === 'video'}
							<!-- svelte-ignore a11y_media_has_caption -->
							<video
								src={media.url}
								class={$dialogSize === 'fit'
									? 'pointer-events-auto rounded-[var(--radius-sm)] object-contain'
									: 'pointer-events-auto rounded-[var(--radius-sm)]'}
								style={fitMediaStyle}
								controls
								autoplay
								loop={!advanceOnVideoEnd}
								onloadedmetadata={handleVideoMetadata}
								onended={handleVideoEnded}
							></video>
						{:else}
							<img
								src={media.url}
								alt={media.name}
								class={$dialogSize === 'fit'
									? 'pointer-events-auto rounded-[var(--radius-sm)] object-contain'
									: 'pointer-events-auto rounded-[var(--radius-sm)]'}
								style={fitMediaStyle}
								draggable="false"
								onload={handleImageLoad}
							/>
						{/if}
					</div>

					<p class="pointer-events-auto mt-2 max-w-full shrink-0 truncate px-2 text-center text-xs text-[var(--text-muted)]">{media.path}</p>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
