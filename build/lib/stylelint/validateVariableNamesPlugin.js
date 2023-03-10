"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const stylelint = require('stylelint');
const validateVariableNames_1 = require("./validateVariableNames");
const ruleName = 'vscode/variables-validate-names';
const messages = stylelint.utils.ruleMessages(ruleName, {
    expected: 'Unknown CSS variable'
});
const ruleFunction = () => {
    let sharedValidator;
    return async (root, result) => {
        const validator = sharedValidator || await (0, validateVariableNames_1.getVariableNameValidator)();
        root.walkDecls(decl => {
            validator(decl.value, variableName => {
                stylelint.utils.report({
                    message: `Unknown CSS variable ${variableName}`,
                    node: decl,
                    result,
                    ruleName
                });
            });
        });
    };
};
ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
module.exports = stylelint.createPlugin(ruleName, ruleFunction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGVWYXJpYWJsZU5hbWVzUGx1Z2luLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmFsaWRhdGVWYXJpYWJsZU5hbWVzUGx1Z2luLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7QUFFaEcsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBSXZDLG1FQUErRTtBQUUvRSxNQUFNLFFBQVEsR0FBRyxpQ0FBaUMsQ0FBQztBQUNuRCxNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUU7SUFDdkQsUUFBUSxFQUFFLHNCQUFzQjtDQUNoQyxDQUFDLENBQUM7QUFJSCxNQUFNLFlBQVksR0FBZ0MsR0FBRyxFQUFFO0lBQ3RELElBQUksZUFBdUMsQ0FBQztJQUM1QyxPQUFPLEtBQUssRUFBRSxJQUFVLEVBQUUsTUFBcUIsRUFBRSxFQUFFO1FBQ2xELE1BQU0sU0FBUyxHQUFHLGVBQWUsSUFBSSxNQUFNLElBQUEsZ0RBQXdCLEdBQUUsQ0FBQztRQUN0RSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQ3JCLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxFQUFFO2dCQUNwQyxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQztvQkFDdEIsT0FBTyxFQUFFLHdCQUF3QixZQUFZLEVBQUU7b0JBQy9DLElBQUksRUFBRSxJQUFJO29CQUNWLE1BQU07b0JBQ04sUUFBUTtpQkFDUixDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsWUFBWSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7QUFDakMsWUFBWSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7QUFFakMsTUFBTSxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxZQUFZLENBQUMsQ0FBQyJ9