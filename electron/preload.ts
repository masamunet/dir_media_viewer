import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
	convertMedia: (arrayBuffer: ArrayBuffer, mediaType: string) => {
		return ipcRenderer.invoke('convert-media', arrayBuffer, mediaType);
	}
});
