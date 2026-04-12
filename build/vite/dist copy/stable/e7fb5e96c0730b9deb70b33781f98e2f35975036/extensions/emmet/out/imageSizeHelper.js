"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImageSize = getImageSize;
// Based on @sergeche's work on the emmet plugin for atom
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
const image_size_1 = require("image-size");
const reUrl = /^https?:/;
/**
 * Get size of given image file. Supports files from local filesystem,
 * as well as URLs
 */
function getImageSize(file) {
    file = file.replace(/^file:\/\//, '');
    return reUrl.test(file) ? getImageSizeFromURL(file) : getImageSizeFromFile(file);
}
/**
 * Get image size from file on local file system
 */
function getImageSizeFromFile(file) {
    return new Promise((resolve, reject) => {
        const isDataUrl = file.match(/^data:.+?;base64,/);
        if (isDataUrl) {
            // NB should use sync version of `sizeOf()` for buffers
            try {
                const data = Buffer.from(file.slice(isDataUrl[0].length), 'base64');
                return resolve(sizeForFileName('', (0, image_size_1.imageSize)(data)));
            }
            catch (err) {
                return reject(err);
            }
        }
        (0, image_size_1.imageSize)(file, (err, size) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(sizeForFileName(path.basename(file), size));
            }
        });
    });
}
/**
 * Get image size from given remove URL
 */
function getImageSizeFromURL(urlStr) {
    return new Promise((resolve, reject) => {
        const url = new url_1.URL(urlStr);
        const getTransport = url.protocol === 'https:' ? https.get : http.get;
        if (!url.pathname) {
            return reject('Given url doesnt have pathname property');
        }
        const urlPath = url.pathname;
        getTransport(url, resp => {
            const chunks = [];
            let bufSize = 0;
            const trySize = (chunks) => {
                try {
                    const size = (0, image_size_1.imageSize)(Buffer.concat(chunks, bufSize));
                    resp.removeListener('data', onData);
                    resp.destroy(); // no need to read further
                    resolve(sizeForFileName(path.basename(urlPath), size));
                }
                catch (err) {
                    // might not have enough data, skip error
                }
            };
            const onData = (chunk) => {
                bufSize += chunk.length;
                chunks.push(chunk);
                trySize(chunks);
            };
            resp
                .on('data', onData)
                .on('end', () => trySize(chunks))
                .once('error', err => {
                resp.removeListener('data', onData);
                reject(err);
            });
        }).once('error', reject);
    });
}
/**
 * Returns size object for given file name. If file name contains `@Nx` token,
 * the final dimentions will be downscaled by N
 */
function sizeForFileName(fileName, size) {
    const m = fileName.match(/@(\d+)x\./);
    const scale = m ? +m[1] : 1;
    if (!size || !size.width || !size.height) {
        return;
    }
    return {
        realWidth: size.width,
        realHeight: size.height,
        width: Math.floor(size.width / scale),
        height: Math.floor(size.height / scale)
    };
}
//# sourceMappingURL=imageSizeHelper.js.map