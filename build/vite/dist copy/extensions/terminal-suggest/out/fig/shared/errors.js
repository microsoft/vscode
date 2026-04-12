"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createErrorInstance = void 0;
const createErrorInstance = (name) => class extends Error {
    constructor(message) {
        super(message);
        this.name = `Fig.${name}`;
    }
};
exports.createErrorInstance = createErrorInstance;
//# sourceMappingURL=errors.js.map