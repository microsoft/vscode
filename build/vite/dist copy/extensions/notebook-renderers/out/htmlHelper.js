"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ttPolicy = void 0;
exports.ttPolicy = (typeof window !== 'undefined') ?
    window.trustedTypes?.createPolicy('notebookRenderer', {
        createHTML: (value) => value,
        createScript: (value) => value,
    }) : undefined;
//# sourceMappingURL=htmlHelper.js.map