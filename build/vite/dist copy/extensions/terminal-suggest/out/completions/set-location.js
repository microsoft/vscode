"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const cdSpec = {
    name: 'Set-Location',
    description: 'Change the shell working directory',
    args: {
        name: 'folder',
        template: 'folders',
        suggestions: [
            {
                name: '-',
                description: 'Go to previous directory in history stack',
                hidden: true,
            },
            {
                name: '+',
                description: 'Go to next directory in history stack',
                hidden: true,
            },
        ],
    }
};
exports.default = cdSpec;
//# sourceMappingURL=set-location.js.map