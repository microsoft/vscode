"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.readScripts = void 0;
const jsonc_parser_1 = require("jsonc-parser");
const vscode_1 = require("vscode");
const readScripts = (document, buffer = document.getText()) => {
    let start;
    let end;
    let inScripts = false;
    let buildingScript;
    let level = 0;
    const scripts = [];
    const visitor = {
        onError() {
            // no-op
        },
        onObjectBegin() {
            level++;
        },
        onObjectEnd(offset) {
            if (inScripts) {
                end = document.positionAt(offset);
                inScripts = false;
            }
            level--;
        },
        onLiteralValue(value, offset, length) {
            if (buildingScript && typeof value === 'string') {
                scripts.push({
                    ...buildingScript,
                    value,
                    valueRange: new vscode_1.Range(document.positionAt(offset), document.positionAt(offset + length)),
                });
                buildingScript = undefined;
            }
        },
        onObjectProperty(property, offset, length) {
            if (level === 1 && property === 'scripts') {
                inScripts = true;
                start = document.positionAt(offset);
            }
            else if (inScripts) {
                buildingScript = {
                    name: property,
                    nameRange: new vscode_1.Range(document.positionAt(offset), document.positionAt(offset + length))
                };
            }
        },
    };
    (0, jsonc_parser_1.visit)(buffer, visitor);
    if (start === undefined) {
        return undefined;
    }
    return { location: new vscode_1.Location(document.uri, new vscode_1.Range(start, end ?? start)), scripts };
};
exports.readScripts = readScripts;
//# sourceMappingURL=readScripts.js.map