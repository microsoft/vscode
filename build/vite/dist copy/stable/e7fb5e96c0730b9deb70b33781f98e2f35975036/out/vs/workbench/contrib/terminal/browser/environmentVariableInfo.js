/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { ITerminalService } from './terminal.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import Severity from '../../../../base/common/severity.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
let EnvironmentVariableInfoStale = class EnvironmentVariableInfoStale {
    constructor(_diff, _terminalId, _collection, _terminalService, _extensionService) {
        this._diff = _diff;
        this._terminalId = _terminalId;
        this._collection = _collection;
        this._terminalService = _terminalService;
        this._extensionService = _extensionService;
        this.requiresAction = true;
    }
    _getInfo(scope) {
        const extSet = new Set();
        addExtensionIdentifiers(extSet, this._diff.added.values());
        addExtensionIdentifiers(extSet, this._diff.removed.values());
        addExtensionIdentifiers(extSet, this._diff.changed.values());
        let message = localize('extensionEnvironmentContributionInfoStale', "The following extensions want to relaunch the terminal to contribute to its environment:");
        message += getMergedDescription(this._collection, scope, this._extensionService, extSet);
        return message;
    }
    _getActions() {
        return [{
                label: localize('relaunchTerminalLabel', "Relaunch Terminal"),
                run: () => this._terminalService.getInstanceFromId(this._terminalId)?.relaunch(),
                commandId: "workbench.action.terminal.relaunch" /* TerminalCommandId.Relaunch */
            }];
    }
    getStatus(scope) {
        return {
            id: "relaunch-needed" /* TerminalStatus.RelaunchNeeded */,
            severity: Severity.Warning,
            icon: Codicon.warning,
            tooltip: this._getInfo(scope),
            hoverActions: this._getActions()
        };
    }
};
EnvironmentVariableInfoStale = __decorate([
    __param(3, ITerminalService),
    __param(4, IExtensionService)
], EnvironmentVariableInfoStale);
export { EnvironmentVariableInfoStale };
let EnvironmentVariableInfoChangesActive = class EnvironmentVariableInfoChangesActive {
    constructor(_collection, _commandService, _extensionService) {
        this._collection = _collection;
        this._commandService = _commandService;
        this._extensionService = _extensionService;
        this.requiresAction = false;
    }
    _getInfo(scope) {
        const extSet = new Set();
        addExtensionIdentifiers(extSet, this._collection.getVariableMap(scope).values());
        let message = localize('extensionEnvironmentContributionInfoActive', "The following extensions have contributed to this terminal's environment:");
        message += getMergedDescription(this._collection, scope, this._extensionService, extSet);
        return message;
    }
    _getActions(scope) {
        return [{
                label: localize('showEnvironmentContributions', "Show Environment Contributions"),
                run: () => this._commandService.executeCommand("workbench.action.terminal.showEnvironmentContributions" /* TerminalCommandId.ShowEnvironmentContributions */, scope),
                commandId: "workbench.action.terminal.showEnvironmentContributions" /* TerminalCommandId.ShowEnvironmentContributions */
            }];
    }
    getStatus(scope) {
        return {
            id: "env-var-info-changes-active" /* TerminalStatus.EnvironmentVariableInfoChangesActive */,
            severity: Severity.Info,
            tooltip: undefined, // The action is present when details aren't shown
            detailedTooltip: this._getInfo(scope),
            hoverActions: this._getActions(scope)
        };
    }
};
EnvironmentVariableInfoChangesActive = __decorate([
    __param(1, ICommandService),
    __param(2, IExtensionService)
], EnvironmentVariableInfoChangesActive);
export { EnvironmentVariableInfoChangesActive };
function getMergedDescription(collection, scope, extensionService, extSet) {
    const message = ['\n'];
    const globalDescriptions = collection.getDescriptionMap(undefined);
    const workspaceDescriptions = collection.getDescriptionMap(scope);
    for (const ext of extSet) {
        const globalDescription = globalDescriptions.get(ext);
        if (globalDescription) {
            message.push(`\n- \`${getExtensionName(ext, extensionService)}\``);
            message.push(`: ${globalDescription}`);
        }
        const workspaceDescription = workspaceDescriptions.get(ext);
        if (workspaceDescription) {
            // Only show '(workspace)' suffix if there is already a description for the extension.
            const workspaceSuffix = globalDescription ? ` (${localize('ScopedEnvironmentContributionInfo', 'workspace')})` : '';
            message.push(`\n- \`${getExtensionName(ext, extensionService)}${workspaceSuffix}\``);
            message.push(`: ${workspaceDescription}`);
        }
        if (!globalDescription && !workspaceDescription) {
            message.push(`\n- \`${getExtensionName(ext, extensionService)}\``);
        }
    }
    return message.join('');
}
function addExtensionIdentifiers(extSet, diff) {
    for (const mutators of diff) {
        for (const mutator of mutators) {
            extSet.add(mutator.extensionIdentifier);
        }
    }
}
function getExtensionName(id, extensionService) {
    return extensionService.extensions.find(e => e.id === id)?.displayName || id;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnRWYXJpYWJsZUluZm8uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9icm93c2VyL2Vudmlyb25tZW50VmFyaWFibGVJbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBSWhHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNqRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRzlELE9BQU8sUUFBUSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUUvRSxJQUFNLDRCQUE0QixHQUFsQyxNQUFNLDRCQUE0QjtJQUd4QyxZQUNrQixLQUErQyxFQUMvQyxXQUFtQixFQUNuQixXQUFpRCxFQUNoRCxnQkFBbUQsRUFDbEQsaUJBQXFEO1FBSnZELFVBQUssR0FBTCxLQUFLLENBQTBDO1FBQy9DLGdCQUFXLEdBQVgsV0FBVyxDQUFRO1FBQ25CLGdCQUFXLEdBQVgsV0FBVyxDQUFzQztRQUMvQixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQWtCO1FBQ2pDLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBbUI7UUFQaEUsbUJBQWMsR0FBRyxJQUFJLENBQUM7SUFTL0IsQ0FBQztJQUVPLFFBQVEsQ0FBQyxLQUEyQztRQUMzRCxNQUFNLE1BQU0sR0FBZ0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUN0Qyx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENB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