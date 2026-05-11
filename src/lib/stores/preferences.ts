import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type GridSize = 'sm' | 'md' | 'lg';
export type DialogSize = 'original' | 'fit';
export type MediaFilter = 'all' | 'image' | 'video';
export type MediaSortOrder = 'asc' | 'desc';

function persisted<T>(key: string, initial: T) {
	const stored = browser ? localStorage.getItem(key) : null;
	const value = stored ? (JSON.parse(stored) as T) : initial;
	const store = writable<T>(value);

	if (browser) {
		store.subscribe((v) => localStorage.setItem(key, JSON.stringify(v)));
	}

	return store;
}

export const gridSize = persisted<GridSize>('dmv:gridSize', 'md');
export const recursive = writable<boolean>(false);
export const dialogSize = persisted<DialogSize>('dmv:dialogSize', 'fit');
export const mediaFilter = persisted<MediaFilter>('dmv:mediaFilter', 'all');
export const mediaSortOrder = persisted<MediaSortOrder>('dmv:mediaSortOrder', 'desc');
