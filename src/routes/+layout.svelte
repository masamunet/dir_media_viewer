<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Media Viewer</title>
</svelte:head>

{@render children()}
