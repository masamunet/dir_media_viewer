<script lang="ts">
	import { Play } from 'lucide-svelte';
	import type { MediaFile } from '$lib/stores/media';

	let {
		media,
		onclick,
		index = 0,
		tabindex = -1
	}: {
		media: MediaFile;
		onclick: () => void;
		index?: number;
		tabindex?: number;
	} = $props();

	let el: HTMLButtonElement;
	let visible = $state(false);
	let loaded = $state(false);

	$effect(() => {
		if (!el) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					visible = true;
					observer.disconnect();
				}
			},
			{ threshold: 0.08, rootMargin: '40px' }
		);
		observer.observe(el);
		return () => observer.disconnect();
	});

	function handleFocus() {
		// Once focused via Tab, make all cards tabbable
		const grid = el?.parentElement;
		if (!grid) return;
		grid.querySelectorAll<HTMLButtonElement>(':scope > button').forEach((btn) => {
			btn.tabIndex = 0;
		});
	}
</script>

<button
	bind:this={el}
	class="group relative w-full cursor-pointer overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-2)] ring-1 ring-[var(--border)] transition-all duration-500 ease-out hover:ring-[var(--accent)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-0)]
		{visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'}"
	style="aspect-ratio: var(--aspect, 1); transition-delay: {(index % 12) * 30}ms"
	{onclick}
	onfocus={handleFocus}
	type="button"
	{tabindex}
>
	<!-- Loading skeleton -->
	{#if !loaded}
		<div class="absolute inset-0 flex items-center justify-center">
			<div class="absolute inset-0 animate-pulse bg-[var(--surface-3)]/50"></div>
			<div class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--accent-cyan)]/5 to-transparent animate-[shimmer_1.5s_infinite]"></div>
			<div class="relative h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent-cyan)]/20 border-t-[var(--accent-cyan)]/60"></div>
		</div>
	{/if}

	{#if media.type === 'video'}
		<video
			src={media.url}
			class="h-full w-full object-cover transition-opacity duration-300 {loaded ? 'opacity-100' : 'opacity-0'}"
			muted
			loop
			autoplay
			playsinline
			disablepictureinpicture
			onloadeddata={() => (loaded = true)}
		></video>
		{#if loaded}
			<div class="absolute bottom-1 left-1 flex items-center gap-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-0)]/70 px-1 py-0.5">
				<Play class="h-2.5 w-2.5 fill-current text-[var(--accent-alt)]" />
				<span class="text-[10px] text-[var(--accent-alt)]/80">VIDEO</span>
			</div>
		{/if}
	{:else}
		<img
			src={media.url}
			alt={media.name}
			class="h-full w-full object-cover transition-opacity duration-300 {loaded ? 'opacity-100' : 'opacity-0'}"
			loading="lazy"
			draggable="false"
			onload={() => (loaded = true)}
		/>
	{/if}

	{#if loaded}
		<div class="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-[var(--surface-0)]/90 to-transparent px-2 pb-1.5 pt-6 transition-transform group-hover:translate-y-0 group-focus-visible:translate-y-0">
			<p class="truncate text-xs text-[var(--accent-cyan)]">{media.name}</p>
			{#if media.path.includes('/')}
				<p class="truncate text-[10px] text-[var(--text-muted)]">{media.path}</p>
			{/if}
		</div>
	{/if}
</button>

<style>
	@keyframes shimmer {
		0% { transform: translateX(-100%); }
		100% { transform: translateX(100%); }
	}
</style>
