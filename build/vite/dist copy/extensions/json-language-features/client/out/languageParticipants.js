"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLanguageParticipants = getLanguageParticipants;
const vscode_1 = require("vscode");
function getLanguageParticipants() {
    const onDidChangeEmmiter = new vscode_1.EventEmitter();
    let languages = new Set();
    let comments = new Set();
    function update() {
        const oldLanguages = languages, oldComments = comments;
        languages = new Set();
        languages.add('json');
        languages.add('jsonc');
        languages.add('snippets');
        comments = new Set();
        comments.add('jsonc');
        comments.add('snippets');
        for (const extension of vscode_1.extensions.allAcrossExtensionHosts) {
            const jsonLanguageParticipants = extension.packageJSON?.contributes?.jsonLanguageParticipants;
            if (Array.isArray(jsonLanguageParticipants)) {
                for (const jsonLanguageParticipant of jsonLanguageParticipants) {
                    const languageId = jsonLanguageParticipant.languageId;
                    if (typeof languageId === 'string') {
                        languages.add(languageId);
                        if (jsonLanguageParticipant.comments === true) {
                            comments.add(languageId);
                        }
                    }
                }
            }
        }
        return !isEqualSet(languages, oldLanguages) || !isEqualSet(comments, oldComments);
    }
    update();
    const changeListener = vscode_1.extensions.onDidChange(_ => {
        if (update()) {
            onDidChangeEmmiter.fire();
        }
    });
    return {
        onDidChange: onDidChangeEmmiter.event,
        get documentSelector() { return Array.from(languages); },
        hasLanguage(languageId) { return languages.has(languageId); },
        useComments(languageId) { return comments.has(languageId); },
        dispose: () => changeListener.dispose()
    };
}
function isEqualSet(s1, s2) {
    if (s1.size !== s2.size) {
        return false;
    }
    for (const e of s1) {
        if (!s2.has(e)) {
            return false;
        }
    }
    return true;
}
//# sourceMappingURL=languageParticipants.js.map