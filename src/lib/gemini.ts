import pLimit from "p-limit";
import { saveVideoFile, saveVideoFileToDir } from "./store";

const limit = pLimit(2);
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface VideoResult {
    prompt: string;
    status: 'idle' | 'queued' | 'loading' | 'success' | 'error';
    videoBlobUrls?: string[];
    videoFilePaths?: string[];
    error?: string;
}

/** Convert File to base64 string */
export async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function downloadVideoBlob(videoUri: string, apiKey: string): Promise<Blob> {
    const separator = videoUri.includes('?') ? '&' : '?';
    const url = `${videoUri}${separator}key=${apiKey}`;
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
    return await res.blob();
}

async function pollOperation(operationName: string, apiKey: string, saveDir?: string, signal?: AbortSignal): Promise<{ blobUrls: string[]; filePaths: string[] }> {
    while (true) {
        if (signal?.aborted) throw new Error("Cancelled");
        await new Promise(r => setTimeout(r, 10000));
        if (signal?.aborted) throw new Error("Cancelled");
        const res = await fetch(`${BASE_URL}/${operationName}?key=${apiKey}`);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error?.message || "Polling failed");
        }
        const data = await res.json();
        if (data.done) {
            const samples = data.response?.generateVideoResponse?.generatedSamples;
            if (!samples || samples.length === 0) throw new Error("No video in response");

            const blobUrls: string[] = [];
            const filePaths: string[] = [];

            for (let i = 0; i < samples.length; i++) {
                const blob = await downloadVideoBlob(samples[i].video.uri, apiKey);
                const blobUrl = URL.createObjectURL(blob);
                blobUrls.push(blobUrl);

                // Save to disk
                const filename = `veo3_${Date.now()}_${i}.mp4`;
                try {
                    const filePath = saveDir
                        ? await saveVideoFileToDir(blob, filename, saveDir)
                        : await saveVideoFile(blob, filename);
                    filePaths.push(filePath);
                } catch (e) {
                    console.error("Failed to save video to disk:", e);
                }
            }

            return { blobUrls, filePaths };
        }
    }
}

export interface GenerateVideoParams {
    prompt: string;
    model: string;
    apiKey: string;
    aspectRatio?: '16:9' | '9:16';
    saveDir?: string;
    signal?: AbortSignal;
    image?: { base64: string; mimeType: string };
    lastFrame?: { base64: string; mimeType: string };
    referenceImages?: { base64: string; mimeType: string }[];
}

async function startVideoGeneration(params: GenerateVideoParams): Promise<string> {
    const instance: any = { prompt: params.prompt };
    const parameters: any = {};

    if (params.aspectRatio) {
        parameters.aspectRatio = params.aspectRatio;
    }

    if (params.image) {
        instance.image = {
            inlineData: { mimeType: params.image.mimeType, data: params.image.base64 }
        };
    }

    if (params.lastFrame) {
        parameters.lastFrame = {
            inlineData: { mimeType: params.lastFrame.mimeType, data: params.lastFrame.base64 }
        };
    }

    if (params.referenceImages && params.referenceImages.length > 0) {
        parameters.referenceImages = params.referenceImages.map(img => ({
            image: { inlineData: { mimeType: img.mimeType, data: img.base64 } },
            referenceType: "asset",
        }));
    }

    const body: any = { instances: [instance] };
    if (Object.keys(parameters).length > 0) {
        body.parameters = parameters;
    }

    const res = await fetch(
        `${BASE_URL}/models/${params.model}:predictLongRunning?key=${params.apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }
    );

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Failed to start video generation");
    }

    const data = await res.json();
    if (!data.name) throw new Error("No operation name returned");
    return data.name;
}

export async function generateVideo(
    params: GenerateVideoParams,
    onUpdate: (result: Partial<VideoResult>) => void
) {
    onUpdate({ status: 'loading' });
    try {
        const operationName = await startVideoGeneration(params);
        if (params.signal?.aborted) throw new Error("Cancelled");
        const { blobUrls, filePaths } = await pollOperation(operationName, params.apiKey, params.saveDir, params.signal);
        onUpdate({ status: 'success', videoBlobUrls: blobUrls, videoFilePaths: filePaths });
    } catch (err: any) {
        onUpdate({ status: 'error', error: err.message });
    }
}

export async function generateBatch(
    items: GenerateVideoParams[],
    onUpdate: (index: number, result: Partial<VideoResult>) => void
) {
    const tasks = items.map((params, index) =>
        limit(async () => {
            await generateVideo(params, (update) => onUpdate(index, update));
        })
    );
    return Promise.all(tasks);
}
