"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.inlineMeta = inlineMeta;
const es = require("event-stream");
const path_1 = require("path");
function inlineMeta(result, targetFiles, packageJsonContents, productJsonContents) {
    return result.pipe(es.through(function (file) {
        if (file.base === '.' && targetFiles.some(targetFile => file.basename === (0, path_1.basename)(targetFile))) {
            let content = file.contents.toString();
            let changed = false;
            const packageMarker = 'BUILD_INSERT_PACKAGE_CONFIGURATION:"BUILD_INSERT_PACKAGE_CONFIGURATION"';
            if (content.includes(packageMarker)) {
                content = content.replace(packageMarker, JSON.stringify(JSON.parse(packageJsonContents)).slice(1, -1) /* trim braces */);
                changed = true;
            }
            const productMarker = 'BUILD_INSERT_PRODUCT_CONFIGURATION:"BUILD_INSERT_PRODUCT_CONFIGURATION"';
            if (content.includes(productMarker)) {
                content = content.replace(productMarker, JSON.stringify(JSON.parse(productJsonContents)).slice(1, -1) /* trim braces */);
                changed = true;
            }
            if (changed) {
                file.contents = Buffer.from(content);
            }
        }
        this.emit('data', file);
    }));
}
//# sourceMappingURL=inlineMeta.js.map