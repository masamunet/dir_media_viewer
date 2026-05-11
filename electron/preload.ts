import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
	selectExportPath: (mediaType: string, defaultFilename: string) => {
		return ipcRenderer.invoke('select-export-path', mediaType, defaultFilename);
	},
	writeExportedMedia: (token: string, arrayBuffer: ArrayBuffer, mediaType: string) => {
		return ipcRenderer.invoke('write-export-media', token, arrayBuffer, mediaType);
	}
});
