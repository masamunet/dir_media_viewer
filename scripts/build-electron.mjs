import { build } from 'esbuild';

// Build main process
await build({
	entryPoints: ['electron/main.ts'],
	outfile: 'dist-electron/main.mjs',
	bundle: true,
	platform: 'node',
	target: 'node20',
	format: 'esm',
	external: ['electron'],
	banner: {
		js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);'
	}
});

// Build preload script (must be CJS for Electron sandboxed preload)
await build({
	entryPoints: ['electron/preload.ts'],
	outfile: 'dist-electron/preload.cjs',
	bundle: true,
	platform: 'node',
	target: 'node20',
	format: 'cjs',
	external: ['electron']
});

console.log('Electron build complete');
