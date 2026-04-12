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
    let autoInsert = new Set();
    function update() {
        const oldLanguages = languages, oldAutoInsert = autoInsert;
        languages = new Set();
        languages.add('html');
        autoInsert = new Set();
        autoInsert.add('html');
        for (const extension of vscode_1.extensions.allAcrossExtensionHosts) {
            const htmlLanguageParticipants = extension.packageJSON?.contributes?.htmlLanguageParticipants;
            if (Array.isArray(htmlLanguageParticipants)) {
                for (const htmlLanguageParticipant of htmlLanguageParticipants) {
                    const languageId = htmlLanguageParticipant.languageId;
                    if (typeof languageId === 'string') {
                        languages.add(languageId);
                        if (htmlLanguageParticipant.autoInsert !== false) {
                            autoInsert.add(languageId);
                        }
                    }
                }
            }
        }
        return !isEqualSet(languages, oldLanguages) || !isEqualSet(autoInsert, oldAutoInsert);
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
        useAutoInsert(languageId) { return autoInsert.has(languageId); },
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