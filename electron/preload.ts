import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
	convertMedia: (arrayBuffer: ArrayBuffer, fileName: string, mediaType: string) => {
		return ipcRenderer.invoke('convert-media', arrayBuffer, fileName, mediaType);
	}
});
