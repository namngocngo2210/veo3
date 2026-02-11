import { load } from '@tauri-apps/plugin-store';
import { mkdir, writeFile, exists } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';

let storeInstance: Awaited<ReturnType<typeof load>> | null = null;

async function getStore() {
    if (!storeInstance) {
        storeInstance = await load('settings.json', { autoSave: true, defaults: {} });
    }
    return storeInstance;
}

// --- API Key ---
export async function saveApiKey(apiKey: string) {
    const store = await getStore();
    await store.set('gemini_api_key', apiKey);
}

export async function getApiKey(): Promise<string | null> {
    const store = await getStore();
    return (await store.get<string>('gemini_api_key')) ?? null;
}

// --- Model ---
export async function saveModel(model: string) {
    const store = await getStore();
    await store.set('veo_model', model);
}

export async function getModel(): Promise<string> {
    const store = await getStore();
    return (await store.get<string>('veo_model')) ?? 'veo-3.1-generate-preview';
}

// --- Video directory ---
async function getVideoDir(): Promise<string> {
    const appData = await appDataDir();
    const videoDir = await join(appData, 'videos');
    const dirExists = await exists(videoDir);
    if (!dirExists) {
        await mkdir(videoDir, { recursive: true });
    }
    return videoDir;
}

/** Save a video blob to disk, return the file path */
export async function saveVideoFile(blob: Blob, filename: string): Promise<string> {
    const videoDir = await getVideoDir();
    const filePath = await join(videoDir, filename);
    const buffer = await blob.arrayBuffer();
    await writeFile(filePath, new Uint8Array(buffer));
    return filePath;
}

/** Save a video blob to a custom directory */
export async function saveVideoFileToDir(blob: Blob, filename: string, dir: string): Promise<string> {
    const dirExists = await exists(dir);
    if (!dirExists) {
        await mkdir(dir, { recursive: true });
    }
    const filePath = await join(dir, filename);
    const buffer = await blob.arrayBuffer();
    await writeFile(filePath, new Uint8Array(buffer));
    return filePath;
}

/** Convert a local file path to a URL the webview can load */
export function filePathToUrl(filePath: string): string {
    return convertFileSrc(filePath);
}

/** Open a file or folder in the default system application */
export async function openPath(path: string) {
    console.log('Attempting to open path:', path);
    try {
        await invoke('plugin:opener|open', { path });
    } catch (e) {
        console.error('Failed to open path:', e);
    }
}

// --- Prompt History ---
export interface SavedResult {
    prompt: string;
    status: 'idle' | 'queued' | 'loading' | 'success' | 'error';
    videoFilePaths?: string[];
    error?: string;
}

export interface SavedPrompt {
    text: string;
    imageFilePath?: string; // For ImageToVideo
    results: SavedResult[];
}

export interface TabHistory {
    prompts: SavedPrompt[];
}

export async function saveTabHistory(tabKey: string, history: TabHistory) {
    const store = await getStore();
    await store.set(`history_${tabKey}`, history);
}

export async function getTabHistory(tabKey: string): Promise<TabHistory | null> {
    const store = await getStore();
    return (await store.get<TabHistory>(`history_${tabKey}`)) ?? null;
}

// --- Save Path ---
export async function saveSavePath(path: string) {
    const store = await getStore();
    await store.set('save_path', path);
}

export async function getSavePath(): Promise<string | null> {
    const store = await getStore();
    return (await store.get<string>('save_path')) ?? null;
}

// --- Language ---
export async function saveLanguage(lang: string) {
    const store = await getStore();
    await store.set('app_language', lang);
}

export async function getLanguage(): Promise<string> {
    const store = await getStore();
    return (await store.get<string>('app_language')) ?? 'vi';
}

// --- Visual Prompts History ---
export interface VisualPromptsHistory {
    script: string;
    prompts: string[];
    selectedStyleId?: string;
}

export async function saveVisualPromptsHistory(history: VisualPromptsHistory) {
    const store = await getStore();
    await store.set('history_visual_prompts', history);
}

export async function getVisualPromptsHistory(): Promise<VisualPromptsHistory | null> {
    const store = await getStore();
    return (await store.get<VisualPromptsHistory>('history_visual_prompts')) ?? null;
}

// --- Visual Styles ---
export interface VisualStyle {
    id: string;
    name: string;
    config: any;
}

export async function saveVisualStyles(styles: VisualStyle[]) {
    const store = await getStore();
    await store.set('visual_styles', styles);
}

export async function getVisualStyles(): Promise<VisualStyle[]> {
    const store = await getStore();
    return (await store.get<VisualStyle[]>('visual_styles')) ?? [];
}
