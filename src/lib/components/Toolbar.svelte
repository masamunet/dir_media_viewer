<script lang="ts">
	import { Columns2, Grid2x2, Grid3x3, FolderTree, X, Image, Film, Layers, PanelLeftOpen, PanelLeftClose } from 'lucide-svelte';
	import { gridSize, recursive, mediaFilter, type GridSize, type MediaFilter } from '$lib/stores/preferences';

	let { dirName = '', fileCount = 0, onClear, treePath = '', hasTree = false, drawerOpen = false, onToggleDrawer }: {
		dirName: string;
		fileCount: number;
		onClear: () => void;
		treePath?: string;
		hasTree?: boolean;
		drawerOpen?: boolean;
		onToggleDrawer?: () => void;
	} = $props();

	const sizes: { value: GridSize; icon: typeof Grid2x2; label: string; key: string }[] = [
		{ value: 'lg', icon: Columns2, label: '大', key: '1' },
		{ value: 'md', icon: Grid2x2, label: '中', key: '2' },
		{ value: 'sm', icon: Grid3x3, label: '小', key: '3' }
	];

	const filters: { value: MediaFilter; icon: typeof Image; label: string; key: string }[] = [
		{ value: 'all', icon: Layers, label: 'All', key: 'A' },
		{ value: 'image', icon: Image, label: 'Image', key: 'I' },
		{ value: 'video', icon: Film, label: 'Video', key: 'V' }
	];
</script>

<header class="sticky top-0 z-40 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-0)]/95 px-4 py-2 backdrop-blur-sm">
	<div class="flex items-center gap-2 overflow-hidden">
		{#if hasTree}
			<button
				tabindex={-1}
				class="shrink-0 rounded-[var(--radius-sm)] p-1 transition-colors
					{drawerOpen ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}"
				onclick={onToggleDrawer}
				title="ディレクトリツリー [⇧⇧]"
			>
				{#if drawerOpen}
					<PanelLeftClose class="h-4 w-4" />
				{:else}
					<PanelLeftOpen class="h-4 w-4" />
				{/if}
			</button>
		{/if}
		<span class="truncate text-sm font-medium text-[var(--accent-cyan)]">{dirName}</span>
		{#if treePath}
			<span class="shrink-0 text-xs text-[var(--text-muted)]">/</span>
			<span class="truncate text-xs text-[var(--text-secondary)]">{treePath || '.'}</span>
		{/if}
		<span class="shrink-0 text-xs text-[var(--text-muted)]">{fileCount}</span>
	</div>

	<div class="ml-auto flex items-center gap-1">
		<button
			tabindex={-1}
			class="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-xs transition-colors
				{$recursive ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)]'}"
			onclick={() => recursive.update((v) => !v)}
			title="再帰表示 [R]"
		>
			<FolderTree class="h-3.5 w-3.5" />
			<span>Recursive</span>
			<kbd class="ml-0.5 text-[9px] opacity-40">R</kbd>
		</button>

		<div class="mx-1 h-4 w-px bg-[var(--border)]"></div>

		{#each filters as f}
			<button
				tabindex={-1}
				class="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs transition-colors
					{$mediaFilter === f.value ? 'bg-[var(--accent-warn)]/15 text-[var(--accent-warn)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}"
				onclick={() => mediaFilter.set(f.value)}
				title="{f.label} [{f.key}]"
			>
				<f.icon class="h-3.5 w-3.5" />
				<span>{f.label}</span>
				<kbd class="ml-0.5 text-[9px] opacity-40">{f.key}</kbd>
			</button>
		{/each}

		<div class="mx-1 h-4 w-px bg-[var(--border)]"></div>

		{#each sizes as s}
			<button
				tabindex={-1}
				class="flex items-center gap-0.5 rounded-[var(--radius-sm)] p-1.5 transition-colors
					{$gridSize === s.value ? 'bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}"
				onclick={() => gridSize.set(s.value)}
				title="Grid: {s.label} [{s.key}]"
			>
				<s.icon class="h-4 w-4" />
				<kbd class="text-[9px] opacity-40">{s.key}</kbd>
			</button>
		{/each}

		<div class="mx-1 h-4 w-px bg-[var(--border)]"></div>

		<button
			tabindex={-1}
			class="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-alt)]/15 hover:text-[var(--accent-alt)]"
			onclick={onClear}
			title="クリア [Esc]"
		>
			<X class="h-3.5 w-3.5" />
			<span>Clear</span>
			<kbd class="ml-0.5 text-[9px] opacity-40">Esc</kbd>
		</button>
	</div>
</header>
