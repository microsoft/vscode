"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------
const _positiveLookBehind = /\(\?<=.+/;
const _negativeLookBehind = /\(\?<!.+/;
function _containsLookBehind(pattern) {
    if (typeof pattern !== 'string') {
        return false;
    }
    return _positiveLookBehind.test(pattern) || _negativeLookBehind.test(pattern);
}
module.exports = {
    create(context) {
        return {
            // /.../
            ['Literal[regex]']: (node) => {
                const pattern = node.regex?.pattern;
                if (_containsLookBehind(pattern)) {
                    context.report({
                        node,
                        message: 'Look behind assertions are not yet supported in all browsers'
                    });
                }
            },
            // new Regex("...")
            ['NewExpression[callee.name="RegExp"] Literal']: (node) => {
                if (_containsLookBehind(node.value)) {
                    context.report({
                        node,
                        message: 'Look behind assertions are not yet supported in all browsers'
                    });
                }
            }
        };
    }
};
