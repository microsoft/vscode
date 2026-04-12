"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSnippet = resolveSnippet;
/**
 * Resolves variables in a VS Code snippet style string
 */
function resolveSnippet(snippetString, vars) {
    return snippetString.replaceAll(/(?<escape>\\\$)|(?<!\\)\$\{(?<name>\w+)(?:\/(?<pattern>(?:\\\/|[^\}])+?)\/(?<replacement>(?:\\\/|[^\}])+?)\/)?\}/g, (match, _escape, name, pattern, replacement, _offset, _str, groups) => {
        if (groups?.['escape']) {
            return '$';
        }
        const entry = vars.get(name);
        if (typeof entry !== 'string') {
            return match;
        }
        if (pattern && replacement) {
            return entry.replace(new RegExp(replaceTransformEscapes(pattern)), replaceTransformEscapes(replacement));
        }
        return entry;
    });
}
function replaceTransformEscapes(str) {
    return str.replaceAll(/\\\//g, '/');
}
//# sourceMappingURL=snippets.js.map