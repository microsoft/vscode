/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { joinPath } from '../../../../base/common/resources.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
/**
 * Resizes an image provided as a UInt8Array string. Resizing is based on Open AI's algorithm for tokenzing images.
 * https://platform.openai.com/docs/guides/vision#calculating-costs
 * @param data - The UInt8Array string of the image to resize.
 * @returns A promise that resolves to the UInt8Array string of the resized image.
 */
export async function resizeImage(data, mimeType) {
    const isGif = mimeType === 'image/gif';
    if (typeof data === 'string') {
        data = convertStringToUInt8Array(data);
    }
    return new Promise((resolve, reject) => {
        const blob = new Blob([data], { type: mimeType });
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.src = url;
        img.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = img;
            if ((width <= 768 || height <= 768) && !isGif) {
                resolve(data);
                return;
            }
            // Calculate the new dimensions while maintaining the aspect ratio
            if (width > 2048 || height > 2048) {
                const scaleFactor = 2048 / Math.max(width, height);
                width = Math.round(width * scaleFactor);
                height = Math.round(height * scaleFactor);
            }
            const scaleFactor = 768 / Math.min(width, height);
            width = Math.round(width * scaleFactor);
            height = Math.round(height * scaleFactor);
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                const jpegTypes = ['image/jpeg', 'image/jpg'];
                const outputMimeType = mimeType && jpegTypes.includes(mimeType) ? 'image/jpeg' : 'image/png';
                canvas.toBlob(blob => {
                    if (blob) {
                        const reader = new FileReader();
                        reader.onload = () => {
                            resolve(new Uint8Array(reader.result));
                        };
                        reader.onerror = (error) => reject(error);
                        reader.readAsArrayBuffer(blob);
                    }
                    else {
                        reject(new Error('Failed to create blob from canvas'));
                    }
                }, outputMimeType);
            }
            else {
                reject(new Error('Failed to get canvas context'));
            }
        };
        img.onerror = (error) => {
            URL.revokeObjectURL(url);
            reject(error);
        };
    });
}
export function convertStringToUInt8Array(data) {
    const base64Data = data.includes(',') ? data.split(',')[1] : data;
    if (isValidBase64(base64Data)) {
        return decodeBase64(base64Data).buffer;
    }
    return new TextEncoder().encode(data);
}
// Only used for URLs
export function convertUint8ArrayToString(data) {
    try {
        const decoder = new TextDecoder();
        const decodedString = decoder.decode(data);
        return decodedString;
    }
    catch {
        return '';
    }
}
function isValidBase64(str) {
    // checks if the string is a valid base64 string that is NOT encoded
    return /^[A-Za-z0-9+/]*={0,2}$/.test(str) && (() => {
        try {
            atob(str);
            return true;
        }
        catch {
            return false;
        }
    })();
}
export async function createFileForMedia(fileService, imagesFolder, dataTransfer, mimeType) {
    const exists = await fileService.exists(imagesFolder);
    if (!exists) {
        await fileService.createFolder(imagesFolder);
    }
    const ext = mimeType.split('/')[1] || 'png';
    const filename = `image-${Date.now()}.${ext}`;
    const fileUri = joinPath(imagesFolder, filename);
    const buffer = VSBuffer.wrap(dataTransfer);
    await fileService.writeFile(fileUri, buffer);
    return fileUri;
}
export async function cleanupOldImages(fileService, logService, imagesFolder) {
    const exists = await fileService.exists(imagesFolder);
    if (!exists) {
        return;
    }
    const duration = 7 * 24 * 60 * 60 * 1000; // 7 days
    const files = await fileService.resolve(imagesFolder);
    if (!files.children) {
        return;
    }
    await Promise.all(files.children.map(async (file) => {
        try {
            const timestamp = getTimestampFromFilename(file.name);
            if (timestamp && (Date.now() - timestamp > duration)) {
                await fileService.del(file.resource);
            }
        }
        catch (err) {
            logService.error('Failed to clean up old images', err);
        }
    }));
}
function getTimestampFromFilename(filename) {
    const match = filename.match(/image-(\d+)\./);
    if (match) {
        return parseInt(match[1], 10);
    }
    return undefined;
}
CommandsRegistry.registerCommand('_chat.resizeImage', async (_accessor, data, mimeType) => {
    if (data instanceof VSBuffer) {
        data = data.buffer;
    }
    return resizeImage(data, mimeType);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEltYWdlVXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdEltYWdlVXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFJaEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFcEY7Ozs7O0dBS0c7QUFFSCxNQUFNLENBQUMsS0FBSyxVQUFVLFdBQVcsQ0FBQyxJQUF5QixFQUFFLFFBQWlCO0lBQzdFLE1BQU0sS0FBSyxHQUFHLFFBQVEsS0FBSyxXQUFXLENBQUM7SUFFdkMsSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUM5QixJQUFJLEdBQUcseUJBQXlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVELE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDdEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxJQUErQixDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUM3RSxNQUFNLEdBQUcsR0FBRyxJQUFJLEtBQUssRUFBRSxDQUFDO1FBQ3hCLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEMsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFFZCxHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsRUFBRTtZQUNqQixHQUFHLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lB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