"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDocumentContext = getDocumentContext;
const strings_1 = require("../utils/strings");
const vscode_uri_1 = require("vscode-uri");
function getDocumentContext(documentUri, workspaceFolders) {
    function getRootFolder() {
        for (const folder of workspaceFolders) {
            let folderURI = folder.uri;
            if (!(0, strings_1.endsWith)(folderURI, '/')) {
                folderURI = folderURI + '/';
            }
            if ((0, strings_1.startsWith)(documentUri, folderURI)) {
                return folderURI;
            }
        }
        return undefined;
    }
    return {
        resolveReference: (ref, base = documentUri) => {
            if (ref.match(/^\w[\w\d+.-]*:/)) {
                // starts with a schema
                return ref;
            }
            if (ref[0] === '/') { // resolve absolute path against the current workspace folder
                const folderUri = getRootFolder();
                if (folderUri) {
                    return folderUri + ref.substr(1);
                }
            }
            const baseUri = vscode_uri_1.URI.parse(base);
            const baseUriDir = baseUri.path.endsWith('/') ? baseUri : vscode_uri_1.Utils.dirname(baseUri);
            return vscode_uri_1.Utils.resolvePath(baseUriDir, ref).toString(true);
        },
    };
}
//# sourceMappingURL=documentContext.js.map