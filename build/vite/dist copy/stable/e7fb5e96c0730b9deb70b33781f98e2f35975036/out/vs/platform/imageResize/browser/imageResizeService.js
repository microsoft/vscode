/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { decodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { joinPath } from '../../../base/common/resources.js';
import { registerSingleton } from '../../instantiation/common/extensions.js';
import { IImageResizeService } from '../common/imageResizeService.js';
export class ImageResizeService {
    /**
     * Resizes an image provided as a UInt8Array string. Resizing is based on Open AI's algorithm for tokenzing images.
     * https://platform.openai.com/docs/guides/vision#calculating-costs
     * @param data - The UInt8Array string of the image to resize.
     * @returns A promise that resolves to the UInt8Array string of the resized image.
     */
    async resizeImage(data, mimeType) {
        const isGif = mimeType === 'image/gif';
        if (typeof data === 'string') {
            data = this.convertStringToUInt8Array(data);
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
    convertStringToUInt8Array(data) {
        const base64Data = data.includes(',') ? data.split(',')[1] : data;
        if (this.isValidBase64(base64Data)) {
            return decodeBase64(base64Data).buffer;
        }
        return new TextEncoder().encode(data);
    }
    // Only used for URLs
    convertUint8ArrayToString(data) {
        try {
            const decoder = new TextDecoder();
            const decodedString = decoder.decode(data);
            return decodedString;
        }
        catch {
            return '';
        }
    }
    isValidBase64(str) {
        try {
            decodeBase64(str);
            return true;
        }
        catch {
            return false;
        }
    }
    async createFileForMedia(fileService, imagesFolder, dataTransfer, mimeType) {
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
    async cleanupOldImages(fileService, logService, imagesFolder) {
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
                const timestamp = this.getTimestampFromFilename(file.name);
                if (timestamp && (Date.now() - timestamp > duration)) {
                    await fileService.del(file.resource);
                }
            }
            catch (err) {
                logService.error('Failed to clean up old images', err);
            }
        }));
    }
    getTimestampFromFilename(filename) {
        const match = filename.match(/image-(\d+)\./);
        if (match) {
            return parseInt(match[1], 10);
        }
        return undefined;
    }
}
registerSingleton(IImageResizeService, ImageResizeService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2VSZXNpemVTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vaW1hZ2VSZXNpemUvYnJvd3Nlci9pbWFnZVJlc2l6ZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFHN0QsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRWhHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBR3RFLE1BQU0sT0FBTyxrQkFBa0I7SUFJOUI7Ozs7O09BS0c7SUFFSCxLQUFLLENBQUMsV0FBVyxDQUFDLElBQXlCLEVBQUUsUUFBaUI7UUFDN0QsTUFBTSxLQUFLLEdBQUcsUUFBUSxLQUFLLFdBQVcsQ0FBQztRQUV2QyxJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzlCLElBQUksR0FBRyxJQUFJLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUVELE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDdEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxJQUErQixDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUM3RSxNQUFNLEdBQUcsR0FBRyxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ3hCLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdEMsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7WUFFZCxHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsRUFBRTtnQkFDakIsR0FBRyxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDekIsSUFBSSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsR0FBRyxHQUFHLENBQUM7Z0JBRTVCLElBQUksQ0FBQyxLQUFLLElBQUksR0FBRyxJQUFJLE1BQU0sSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUMvQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ2QsT0FBTztnQkFDUixDQUFDO2dCQUVELGtFQUFrRTtnQkFDbEUsSUFBSSxLQUFLLEdBQUcsSUFBSSxJQUFJLE1BQU0sR0FBRyxJQUFJLEVBQUUsQ0FBQztvQkFDbkMsTUFBTSxXQUFXLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO29CQUNuRCxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsV0FBVyxDQUFDLENBQUM7b0JBQ3hDLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxXQUFXLENBQUMsQ0FBQztnQkFDM0MsQ0FBQztnQkFFRCxNQUFNLFdBQVcsR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ2xELEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUMsQ0FBQztnQkFDeEMsTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLFdBQVcsQ0FBQyxDQUFDO2dCQUUxQyxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNoRCxNQUFNLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztnQkFDckIsTUFBTSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7Z0JBQ3ZCLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3BDLElBQUksR0FBRyxFQUFFLENBQUM7b0JBQ1QsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7b0JBRXhDLE1BQU0sU0FBUyxHQUFHLENBQUMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxDQUFDO29CQUM5QyxNQUFNLGNBQWMsR0FBRyxRQUFRLElBQUksU0FBUyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUM7b0JBRTdGLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7d0JBQ3BCLElBQUksSUFBSSxFQUFFLENBQUM7NEJBQ1YsTUFBTSxNQUFNLEdBQUcsSUFBSSxVQUFVLEVBQUUsQ0FBQzs0QkFDaEMsTUFBTSxDQUFDLE1BQU0sR0FBRyxHQUFHLEVBQUU7Z0NBQ3BCLE9BQU8sQ0FBQyxJQUFJLFVBQVUsQ0FBQyxNQUFNLENBQUMsTUFBcUIsQ0FBQyxDQUFDLENBQUM7NEJBQ3ZELENBQUMsQ0FBQzs0QkFDRixNQUFNLENBQUMsT0FBTyxHQUFHLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7NEJBQzFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQzt3QkFDaEMsQ0FBQzs2QkFBTSxDQUFDOzRCQUNQLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDLENBQUM7d0JBQ3hELENBQUM7b0JBQ0YsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFDO2dCQUNwQixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQztnQkFDbkQsQ0FBQztZQUNGLENBQUMsQ0FBQztZQUNGLEdBQUcsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxLQUFLLEVBQUUsRUFBRTtnQkFDdkIsR0FBRyxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDekIsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2YsQ0FBQyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQseUJBQXlCLENBQUMsSUFBWTtRQUNyQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDbEUsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDcEMsT0FBTyxZQUFZLENBQUMsVUFBVSxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3hDLENBQUM7UUFDRCxPQUFPLElBQUksV0FBVyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxxQkFBcUI7SUFDckIseUJBQXlCLENBQUMsSUFBZ0I7UUFDekMsSUFBSSxDQUFDO1lBQ0osTUFBTSxPQUFPLEdBQUcsSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNsQyxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNDLE9BQU8sYUFBYSxDQUFDO1FBQ3RCLENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUixPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7SUFDRixDQUFDO0lBRUQsYUFBYSxDQUFDLEdBQVc7UUFDeEIsSUFBSSxDQUFDO1lBQ0osWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2xCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNSLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsa0JBQWtCLENBQUMsV0FBeUIsRUFBRSxZQUFpQixFQUFFLFlBQXdCLEVBQUUsUUFBZ0I7UUFDaEgsTUFBTSxNQUFNLEdBQUcsTUFBTSxXQUFXLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLE1BQU0sV0FBVyxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBRUQsTUFBTSxHQUFHLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUM7UUFDNUMsTUFBTSxRQUFRLEdBQUcsU0FBUyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksR0FBRyxFQUFFLENBQUM7UUFDOUMsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLFlBQVksRUFBRSxRQUFRLENBQUMsQ0FBQztRQUVqRCxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzNDLE1BQU0sV0FBVyxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFN0MsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQztJQUVELEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxXQUF5QixFQUFFLFVBQXVCLEVBQUUsWUFBaUI7UUFDM0YsTUFBTSxNQUFNLEdBQUcsTUFBTSxXQUFXLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDLFNBQVM7UUFDbkQsTUFBTSxLQUFLLEdBQUcsTUFBTSxXQUFXLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDckIsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFO1lBQ25ELElBQUksQ0FBQztnQkFDSixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUMzRCxJQUFJLFNBQVMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxTQUFTLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBQztvQkFDdEQsTUFBTSxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDdEMsQ0FBQztZQUNGLENBQUM7WUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO2dCQUNkLFVBQVUsQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDeEQsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsd0JBQXdCLENBQUMsUUFBZ0I7UUFDeEMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUM5QyxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ1gsT0FBTyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQy9CLENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0NBR0Q7QUFFRCxpQkFBaUIsQ0FBQyxtQkFBbUIsRUFBRSxrQkFBa0Isb0NBQTRCLENBQUMifQ==