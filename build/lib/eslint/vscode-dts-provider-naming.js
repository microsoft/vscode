"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var _a;
module.exports = new (_a = class ApiProviderNaming {
        constructor() {
            this.meta = {
                messages: {
                    naming: 'A provider should only have functions like provideXYZ or resolveXYZ',
                }
            };
        }
        create(context) {
            const config = context.options[0];
            const allowed = new Set(config.allowed);
            return {
                ['TSInterfaceDeclaration[id.name=/.+Provider/] TSMethodSignature']: (node) => {
                    const interfaceName = (node.parent?.parent).id.name;
                    if (allowed.has(interfaceName)) {
                        // allowed
                        return;
                    }
                    const methodName = node.key.name;
                    if (!ApiProviderNaming._providerFunctionNames.test(methodName)) {
                        context.report({
                            node,
                            messageId: 'naming'
                        });
                    }
                }
            };
        }
    },
    _a._providerFunctionNames = /^(provide|resolve|prepare).+/,
    _a);
