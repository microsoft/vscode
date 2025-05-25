"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gulpPostcss = gulpPostcss;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const postcss_1 = __importDefault(require("postcss"));
const event_stream_1 = __importDefault(require("event-stream"));
function gulpPostcss(plugins, handleError) {
    const instance = (0, postcss_1.default)(plugins);
    return event_stream_1.default.map((file, callback) => {
        if (file.isNull()) {
            return callback(null, file);
        }
        if (file.isStream()) {
            return callback(new Error('Streaming not supported'));
        }
        instance
            .process(file.contents.toString(), { from: file.path })
            .then((result) => {
            file.contents = Buffer.from(result.css);
            callback(null, file);
        })
            .catch((error) => {
            if (handleError) {
                handleError(error);
                callback();
            }
            else {
                callback(error);
            }
        });
    });
}
//# sourceMappingURL=postcss.js.map