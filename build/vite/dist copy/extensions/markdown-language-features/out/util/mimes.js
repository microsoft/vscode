"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.mediaFileExtensions = exports.MediaKind = exports.rootMediaMimesTypes = exports.Mime = void 0;
exports.getMediaKindForMime = getMediaKindForMime;
exports.Mime = {
    textUriList: 'text/uri-list',
    textPlain: 'text/plain',
};
exports.rootMediaMimesTypes = Object.freeze({
    image: 'image',
    audio: 'audio',
    video: 'video',
});
var MediaKind;
(function (MediaKind) {
    MediaKind[MediaKind["Image"] = 1] = "Image";
    MediaKind[MediaKind["Video"] = 2] = "Video";
    MediaKind[MediaKind["Audio"] = 3] = "Audio";
})(MediaKind || (exports.MediaKind = MediaKind = {}));
function getMediaKindForMime(mime) {
    const root = mime.toLowerCase().split('/').at(0);
    switch (root) {
        case 'image': return MediaKind.Image;
        case 'video': return MediaKind.Video;
        case 'audio': return MediaKind.Audio;
        default: return undefined;
    }
}
exports.mediaFileExtensions = new Map([
    // Images
    ['avif', MediaKind.Image],
    ['bmp', MediaKind.Image],
    ['gif', MediaKind.Image],
    ['ico', MediaKind.Image],
    ['jpe', MediaKind.Image],
    ['jpeg', MediaKind.Image],
    ['jpg', MediaKind.Image],
    ['png', MediaKind.Image],
    ['psd', MediaKind.Image],
    ['svg', MediaKind.Image],
    ['tga', MediaKind.Image],
    ['tif', MediaKind.Image],
    ['tiff', MediaKind.Image],
    ['webp', MediaKind.Image],
    // Videos
    ['ogg', MediaKind.Video],
    ['mp4', MediaKind.Video],
    ['mov', MediaKind.Video],
    // Audio Files
    ['mp3', MediaKind.Audio],
    ['aac', MediaKind.Audio],
    ['wav', MediaKind.Audio],
]);
//# sourceMappingURL=mimes.js.map