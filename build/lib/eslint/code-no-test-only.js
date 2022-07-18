"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
module.exports = new class NoTestOnly {
    create(context) {
        return {
            ['MemberExpression[object.name="test"][property.name="only"]']: (node) => {
                return context.report({
                    node,
                    message: 'test.only is a dev-time tool and CANNOT be pushed'
                });
            }
        };
    }
};
