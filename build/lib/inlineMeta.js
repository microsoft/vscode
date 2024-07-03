"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.inlineMeta = inlineMeta;
const es = require("event-stream");
const path_1 = require("path");
function inlineMeta(result, ctx) {
    return result.pipe(es.through(function (file) {
        if (matchesFile(file, ctx)) {
            let content = file.contents.toString();
            let markerFound = false;
            const packageMarker = 'BUILD_INSERT_PACKAGE_CONFIGURATION:"BUILD_INSERT_PACKAGE_CONFIGURATION"';
            if (content.includes(packageMarker)) {
                content = content.replace(packageMarker, JSON.stringify(JSON.parse(ctx.packageJsonFn())).slice(1, -1) /* trim braces */);
                markerFound = true;
            }
            const productMarker = 'BUILD_INSERT_PRODUCT_CONFIGURATION:"BUILD_INSERT_PRODUCT_CONFIGURATION"';
            if (content.includes(productMarker)) {
                content = content.replace(productMarker, JSON.stringify(JSON.parse(ctx.productJsonFn())).slice(1, -1) /* trim braces */);
                markerFound = true;
            }
            if (!markerFound) {
                // this.emit('error', new Error(`Unable to inline metadata because markers where not found in ${file.basename}.`));
                // return;
            }
            else {
                file.contents = Buffer.from(content);
            }
        }
        this.emit('data', file);
    }));
}
function matchesFile(file, ctx) {
    for (const target of ctx.targets) {
        if (file.base === target.base && file.basename === (0, path_1.basename)(target.path)) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=inlineMeta.js.map