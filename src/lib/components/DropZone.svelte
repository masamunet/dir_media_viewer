<script lang="ts">
	import { Upload } from 'lucide-svelte';

	let { active = false }: { active: boolean } = $props();
</script>

{#if active}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/80 backdrop-blur-sm"
		role="presentation"
	>
		<div
			class="flex flex-col items-center gap-4 rounded-[var(--radius-md)] border-2 border-dashed border-[var(--accent)] bg-[var(--surface-1)] px-16 py-12"
		>
			<Upload class="h-10 w-10 text-[var(--accent)]" strokeWidth={1.5} />
			<p class="text-sm font-medium text-[var(--accent)]">ディレクトリをドロップ</p>
		</div>
	</div>
{/if}
