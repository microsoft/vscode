/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { extname } from './path.js';
export const Mimes = Object.freeze({
    text: 'text/plain',
    binary: 'application/octet-stream',
    unknown: 'application/unknown',
    markdown: 'text/markdown',
    latex: 'text/latex',
    uriList: 'text/uri-list',
    html: 'text/html',
});
const mapExtToTextMimes = {
    '.css': 'text/css',
    '.csv': 'text/csv',
    '.htm': 'text/html',
    '.html': 'text/html',
    '.ics': 'text/calendar',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.txt': 'text/plain',
    '.xml': 'text/xml'
};
// Known media mimes that we can handle
const mapExtToMediaMimes = {
    '.aac': 'audio/x-aac',
    '.avi': 'video/x-msvideo',
    '.bmp': 'image/bmp',
    '.flv': 'video/x-flv',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.jpe': ['image/jpg', 'image/jpeg'],
    '.jpeg': ['image/jpg', 'image/jpeg'],
    '.jpg': ['image/jpg', 'image/jpeg'],
    '.m1v': 'video/mpeg',
    '.m2a': 'audio/mpeg',
    '.m2v': 'video/mpeg',
    '.m3a': 'audio/mpeg',
    '.mid': 'audio/midi',
    '.midi': 'audio/midi',
    '.mk3d': 'video/x-matroska',
    '.mks': 'video/x-matroska',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.movie': 'video/x-sgi-movie',
    '.mp2': 'audio/mpeg',
    '.mp2a': 'audio/mpeg',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.mp4a': 'audio/mp4',
    '.mp4v': 'video/mp4',
    '.mpe': 'video/mpeg',
    '.mpeg': 'video/mpeg',
    '.mpg': 'video/mpeg',
    '.mpg4': 'video/mp4',
    '.mpga': 'audio/mpeg',
    '.oga': 'audio/ogg',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus',
    '.ogv': 'video/ogg',
    '.png': 'image/png',
    '.psd': 'image/vnd.adobe.photoshop',
    '.qt': 'video/quicktime',
    '.spx': 'audio/ogg',
    '.svg': 'image/svg+xml',
    '.tga': 'image/x-tga',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.wav': 'audio/x-wav',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
    '.wma': 'audio/x-ms-wma',
    '.wmv': 'video/x-ms-wmv',
    '.woff': 'application/font-woff',
};
export function getMediaOrTextMime(path) {
    const ext = extname(path);
    const textMime = mapExtToTextMimes[ext.toLowerCase()];
    if (textMime !== undefined) {
        return textMime;
    }
    else {
        return getMediaMime(path);
    }
}
export function getMediaMime(path) {
    const ext = extname(path);
    const mimeType = mapExtToMediaMimes[ext.toLowerCase()];
    return Array.isArray(mimeType) ? mimeType[0] : mimeType;
}
export function getExtensionForMimeType(mimeType) {
    for (const extension in mapExtToMediaMimes) {
        const value = mapExtToMediaMimes[extension];
        if (Array.isArray(value) ? value.includes(mimeType) : value === mimeType) {
            return extension;
        }
    }
    return undefined;
}
const _simplePattern = /^(.+)\/(.+?)(;.+)?$/;
export function normalizeMimeType(mimeType, strict) {
    const match = _simplePattern.exec(mimeType);
    if (!match) {
        return strict
            ? undefined
            : mimeType;
    }
    // https://datatracker.ietf.org/doc/html/rfc2045#section-5.1
    // media and subtype must ALWAYS be lowercase, parameter not
    return `${match[1].toLowerCase()}/${match[2].toLowerCase()}${match[3] ?? ''}`;
}
/**
 * Whether the provided mime type is a text stream like `stdout`, `stderr`.
 */
export function isTextStreamMime(mimeType) {
    return ['application/vnd.code.notebook.stdout', 'application/vnd.code.notebook.stderr'].includes(mimeType);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWltZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL21pbWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLFdBQVcsQ0FBQztBQUVwQyxNQUFNLENBQUMsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQztJQUNsQyxJQUFJLEVBQUUsWUFBWTtJQUNsQixNQUFNLEVBQUUsMEJBQTBCO0lBQ2xDLE9BQU8sRUFBRSxxQkFBcUI7SUFDOUIsUUFBUSxFQUFFLGVBQWU7SUFDekIsS0FBSyxFQUFFLFlBQVk7SUFDbkIsT0FBTyxFQUFFLGVBQWU7SUFDeEIsSUFBSSxFQUFFLFdBQVc7Q0FDakIsQ0FBQyxDQUFDO0FBTUgsTUFBTSxpQkFBaUIsR0FBMkI7SUFDakQsTUFBTSxFQUFFLFVBQVU7SUFDbEIsTUFBTSxFQUFFLFVBQVU7SUFDbEIsTUFBTSxFQUFFLFdBQVc7SUFDbkIsT0FBTyxFQUFFLFdBQVc7SUFDcEIsTUFBTSxFQUFFLGVBQWU7SUFDdkIsS0FBSyxFQUFFLGlCQUFpQjtJQUN4QixNQUFNLEVBQUUsaUJBQWlCO0lBQ3pCLE1BQU0sRUFBRSxZQUFZO0lBQ3BCLE1BQU0sRUFBRSxVQUFVO0NBQ2xCLENBQUM7QUFFRix1Q0FBdUM7QUFDdkMsTUFBTSxrQkFBa0IsR0FBdUI7SUFDOUMsTUFBTSxFQUFFLGFBQWE7SUFDckIsTUFBTSxFQUFFLGlCQUFpQjtJQUN6QixNQUFNLEVBQUUsV0FBVztJQUNuQixNQUFNLEVBQUUsYUFBYTtJQUNyQixNQUFNLEVBQUUsV0FBVztJQUNuQixNQUFNLEVBQUUsY0FBYztJQUN0QixNQUFNLEVBQUUsQ0FBQyxXQUFXLEVBQUUsWUFBWSxDQUFDO0lBQ25DLE9BQU8sRUFBRSxDQUFDLFdBQVcsRUFBRSxZQUFZLENBQUM7SUFDcEMsTUFB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