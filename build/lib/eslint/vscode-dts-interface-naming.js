"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var _a;
module.exports = new (_a = class ApiInterfaceNaming {
        constructor() {
            this.meta = {
                messages: {
                    naming: 'Interfaces must not be prefixed with uppercase `I`',
                }
            };
        }
        create(context) {
            return {
                ['TSInterfaceDeclaration Identifier']: (node) => {
                    const name = node.name;
                    if (ApiInterfaceNaming._nameRegExp.test(name)) {
                        context.report({
                            node,
                            messageId: 'naming'
                        });
                    }
                }
            };
        }
    },
    _a._nameRegExp = /I[A-Z]/,
    _a);
