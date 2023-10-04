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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGVWYXJpYWJsZU5hbWVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmFsaWRhdGVWYXJpYWJsZU5hbWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBRWhHLDJCQUFrQztBQUNsQyw2QkFBOEI7QUFFOUIsTUFBTSxXQUFXLEdBQUcsMEJBQTBCLENBQUM7QUFFL0MsSUFBSSxjQUF1QyxDQUFDO0FBQzVDLFNBQVMscUJBQXFCO0lBQzdCLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUNyQixNQUFNLHlCQUF5QixHQUFHLElBQUEsaUJBQVksRUFBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSwrQkFBK0IsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3pILE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQ2pFLGNBQWMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLEdBQUcsa0JBQWtCLENBQUMsTUFBTSxFQUFFLEdBQUcsa0JBQWtCLENBQUMsTUFBTSxDQUFhLENBQUMsQ0FBQztJQUNwRyxDQUFDO0lBQ0QsT0FBTyxjQUFjLENBQUM7QUFDdkIsQ0FBQztBQU1ELFNBQWdCLHdCQUF3QjtJQUN2QyxNQUFNLFlBQVksR0FBRyxxQkFBcUIsRUFBRSxDQUFDO0lBQzdDLE9BQU8sQ0FBQyxLQUFhLEVBQUUsTUFBd0MsRUFBRSxFQUFFO1FBQ2xFLFdBQVcsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsa0NBQWtDO1FBQzdELElBQUksS0FBSyxDQUFDO1FBQ1YsT0FBTyxLQUFLLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM5QixJQUFJLFlBQVksSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztnQkFDckQsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ3RCLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQyxDQUFDO0FBQ0gsQ0FBQztBQVpELDREQVlDIn0=