<script lang="ts">
	import { ChevronRight, Folder, FolderOpen } from 'lucide-svelte';
	import {
		type TreeNode,
		cursorPath,
		selectedPath,
		expandNode,
		collapseNode,
		openNode
	} from '$lib/stores/directoryTree';

	interface Props {
		root: TreeNode;
	}

	let { root }: Props = $props();

	function handleNodeClick(node: TreeNode) {
		cursorPath.set(node.path);
		openNode(node.path);
	}

	function handleChevronClick(e: MouseEvent, node: TreeNode) {
		e.stopPropagation();
		if (node.isExpanded) {
			collapseNode(node.path);
		} else {
			expandNode(node.path);
		}
	}
</script>

{#snippet treeItem(node: TreeNode, depth: number)}
	{@const isCursor = $cursorPath === node.path}
	{@const isSelected = $selectedPath === node.path}
	<button
		class="tree-node"
		class:tree-node--cursor={isCursor}
		class:tree-node--selected={isSelected}
		style="padding-left: {12 + depth * 16}px"
		onclick={() => handleNodeClick(node)}
		data-path={node.path}
		role="treeitem"
		aria-expanded={node.children.length > 0 ? node.isExpanded : undefined}
		aria-current={isCursor ? 'true' : undefined}
	>
		{#if node.children.length > 0}
			<span
				class="tree-chevron"
				class:tree-chevron--expanded={node.isExpanded}
				onclick={(e) => handleChevronClick(e, node)}
				role="button"
				tabindex="-1"
			>
				<ChevronRight size={14} />
			</span>
		{:else}
			<span class="tree-chevron tree-chevron--placeholder"></span>
		{/if}

		{#if node.isExpanded && node.children.length > 0}
			<FolderOpen size={14} class="shrink-0 text-[var(--accent-cyan)]" />
		{:else}
			<Folder size={14} class="shrink-0 text-[var(--text-muted)]" />
		{/if}

		<span class="tree-node-name truncate">{node.name}</span>
	</button>

	{#if node.isExpanded}
		{#each node.children as child}
			{@render treeItem(child, depth + 1)}
		{/each}
	{/if}
{/snippet}

<div class="tree-container" role="tree">
	{@render treeItem(root, 0)}
</div>

<style>
	.tree-container {
		display: flex;
		flex-direction: column;
	}

	.tree-node {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding-top: 4px;
		padding-bottom: 4px;
		padding-right: 8px;
		border: none;
		border-left: 2px solid transparent;
		background: transparent;
		color: var(--text-secondary);
		font-size: 12px;
		text-align: left;
		cursor: pointer;
		transition: background-color 0.15s, border-color 0.15s;
	}

	.tree-node:hover {
		background: var(--surface-2);
	}

	.tree-node--cursor {
		border-left-color: var(--accent-cyan);
		background: var(--surface-2);
	}

	.tree-node--selected {
		color: var(--accent);
	}

	.tree-chevron {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		transition: transform 0.15s;
		color: var(--text-muted);
	}

	.tree-chevron--expanded {
		transform: rotate(90deg);
	}

	.tree-chevron--placeholder {
		visibility: hidden;
	}

	.tree-node-name {
		flex: 1;
		min-width: 0;
	}
</style>
