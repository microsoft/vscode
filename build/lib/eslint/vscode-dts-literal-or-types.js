"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
module.exports = new class ApiLiteralOrTypes {
    constructor() {
        this.meta = {
            docs: { url: 'https://github.com/microsoft/vscode/wiki/Extension-API-guidelines#enums' },
            messages: { useEnum: 'Use enums, not literal-or-types', }
        };
    }
    create(context) {
        return {
            ['TSTypeAnnotation TSUnionType']: (node) => {
                if (node.types.every(value => value.type === 'TSLiteralType')) {
                    context.report({
                        node: node,
                        messageId: 'useEnum'
                    });
                }
            }
        };
    }
};
