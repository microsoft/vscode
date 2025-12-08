"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVariableNameValidator = void 0;
const fs_1 = require("fs");
const path = require("path");
const RE_VAR_PROP = /var\(\s*(--([\w\-\.]+))/g;
let knownVariables;
function getKnownVariableNames() {
    if (!knownVariables) {
        const knownVariablesFileContent = (0, fs_1.readFileSync)(path.join(__dirname, './vscode-known-variables.json'), 'utf8').toString();
        const knownVariablesInfo = JSON.parse(knownVariablesFileContent);
        knownVariables = new Set([...knownVariablesInfo.colors, ...knownVariablesInfo.others]);
    }
    return knownVariables;
}
function getVariableNameValidator() {
    const allVariables = getKnownVariableNames();
    return (value, report) => {
        RE_VAR_PROP.lastIndex = 0; // reset lastIndex just to be sure
        let match;
        while (match = RE_VAR_PROP.exec(value)) {
            const variableName = match[1];
            if (variableName && !allVariables.has(variableName)) {
                report(variableName);
            }
        }
    };
}
exports.getVariableNameValidator = getVariableNameValidator;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGVWYXJpYWJsZU5hbWVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmFsaWRhdGVWYXJpYWJsZU5hbWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBRWhHLDJCQUFrQztBQUNsQyw2QkFBOEI7QUFFOUIsTUFBTSxXQUFXLEdBQUcsMEJBQTBCLENBQUM7QUFFL0MsSUFBSSxjQUF1QyxDQUFDO0FBQzVDLFNBQVMscUJBQXFCO0lBQzdCLElBQUksQ0FBQyxjQUFjLEVBQUU7UUFDcEIsTUFBTSx5QkFBeUIsR0FBRyxJQUFBLGlCQUFZLEVBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsK0JBQStCLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUN6SCxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUNqRSxjQUFjLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxHQUFHLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxHQUFHLGtCQUFrQixDQUFDLE1BQU0sQ0FBYSxDQUFDLENBQUM7S0FDbkc7SUFDRCxPQUFPLGNBQWMsQ0FBQztBQUN2QixDQUFDO0FBTUQsU0FBZ0Isd0JBQXdCO0lBQ3ZDLE1BQU0sWUFBWSxHQUFHLHFCQUFxQixFQUFFLENBQUM7SUFDN0MsT0FBTyxDQUFDLEtBQWEsRUFBRSxNQUF3QyxFQUFFLEVBQUU7UUFDbEUsV0FBVyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxrQ0FBa0M7UUFDN0QsSUFBSSxLQUFLLENBQUM7UUFDVixPQUFPLEtBQUssR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ3ZDLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM5QixJQUFJLFlBQVksSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUU7Z0JBQ3BELE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQzthQUNyQjtTQUNEO0lBQ0YsQ0FBQyxDQUFDO0FBQ0gsQ0FBQztBQVpELDREQVlDIn0=