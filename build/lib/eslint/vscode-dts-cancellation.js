"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const experimental_utils_1 = require("@typescript-eslint/experimental-utils");
module.exports = new class ApiProviderNaming {
    constructor() {
        this.meta = {
            messages: {
                noToken: 'Function lacks a cancellation token, preferable as last argument',
            }
        };
    }
    create(context) {
        return {
            ['TSInterfaceDeclaration[id.name=/.+Provider/] TSMethodSignature[key.name=/^(provide|resolve).+/]']: (node) => {
                let found = false;
                for (let param of node.params) {
                    if (param.type === experimental_utils_1.AST_NODE_TYPES.Identifier) {
                        found = found || param.name === 'token';
                    }
                }
                if (!found) {
                    context.report({
                        node,
                        messageId: 'noToken'
                    });
                }
            }
        };
    }
};
