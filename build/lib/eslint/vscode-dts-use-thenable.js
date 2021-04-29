"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
module.exports = new class ApiEventNaming {
    constructor() {
        this.meta = {
            messages: {
                usage: 'Use the Thenable-type instead of the Promise type',
            }
        };
    }
    create(context) {
        return {
            ['TSTypeAnnotation TSTypeReference Identifier[name="Promise"]']: (node) => {
                context.report({
                    node,
                    messageId: 'usage',
                });
            }
        };
    }
};
