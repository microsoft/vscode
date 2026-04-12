/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureEmojis = ensureEmojis;
exports.emojify = emojify;
const vscode_1 = require("vscode");
const main_1 = require("./main");
const util_1 = require("util");
const emojiRegex = /:([-+_a-z0-9]+):/g;
let emojiMap;
let emojiMapPromise;
async function ensureEmojis() {
    if (emojiMap === undefined) {
        if (emojiMapPromise === undefined) {
            emojiMapPromise = loadEmojiMap();
        }
        await emojiMapPromise;
    }
}
async function loadEmojiMap() {
    const context = (0, main_1.getExtensionContext)();
    const uri = vscode_1.Uri.joinPath(context.extensionUri, 'resources', 'emojis.json');
    emojiMap = JSON.parse(new util_1.TextDecoder('utf8').decode(await vscode_1.workspace.fs.readFile(uri)));
}
function emojify(message) {
    if (emojiMap === undefined) {
        return message;
    }
    return message.replace(emojiRegex, (s, code) => {
        return emojiMap?.[code] || s;
    });
}
//# sourceMappingURL=emoji.js.map