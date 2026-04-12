"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const audioPreview_1 = require("./audioPreview");
const binarySizeStatusBarEntry_1 = require("./binarySizeStatusBarEntry");
const imagePreview_1 = require("./imagePreview");
const videoPreview_1 = require("./videoPreview");
function activate(context) {
    const binarySizeStatusBarEntry = new binarySizeStatusBarEntry_1.BinarySizeStatusBarEntry();
    context.subscriptions.push(binarySizeStatusBarEntry);
    context.subscriptions.push((0, imagePreview_1.registerImagePreviewSupport)(context, binarySizeStatusBarEntry));
    context.subscriptions.push((0, audioPreview_1.registerAudioPreviewSupport)(context, binarySizeStatusBarEntry));
    context.subscriptions.push((0, videoPreview_1.registerVideoPreviewSupport)(context, binarySizeStatusBarEntry));
}
//# sourceMappingURL=extension.js.map