<script lang="ts">
	import DirectoryTree from './DirectoryTree.svelte';
	import type { TreeNode } from '$lib/stores/directoryTree';

	interface Props {
		open: boolean;
		root: TreeNode | null;
	}

	let { open, root }: Props = $props();
</script>

{#if root}
	<aside class="drawer" class:drawer--open={open}>
		<div class="drawer-header">
			<span class="drawer-title">Directories</span>
		</div>

		<div class="drawer-body">
			<DirectoryTree {root} />
		</div>

		<div class="drawer-footer">
			<span>↑↓ 移動</span>
			<span>←/⇧ 親</span>
			<span>→ 子</span>
			<span>Space 開く</span>
			<span>S 昇降</span>
			<span>⇧⇧ 閉じる</span>
		</div>
	</aside>
{/if}

<style>
	.drawer {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: var(--drawer-width);
		z-index: 35;
		display: flex;
		flex-direction: column;
		background: var(--surface-1);
		border-right: 1px solid var(--border);
		transform: translateX(-100%);
		transition: transform 0.2s ease;
	}

	.drawer--open {
		transform: translateX(0);
	}

	.drawer-header {
		display: flex;
		align-items: center;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
	}

	.drawer-title {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.drawer-body {
		flex: 1;
		overflow-y: auto;
		padding: 4px 0;
	}

	.drawer-footer {
		display: flex;
		gap: 12px;
		padding: 8px 12px;
		border-top: 1px solid var(--border);
		font-size: 10px;
		color: var(--text-muted);
	}
</style>
