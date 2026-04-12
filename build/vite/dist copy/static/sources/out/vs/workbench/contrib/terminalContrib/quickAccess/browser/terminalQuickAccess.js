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
var TerminalQuickAccessProvider_1;
import { localize } from '../../../../../nls.js';
import { PickerQuickAccessProvider, TriggerAction } from '../../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { matchesFuzzy } from '../../../../../base/common/filters.js';
import { ITerminalEditorService, ITerminalGroupService, ITerminalService } from '../../../terminal/browser/terminal.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { killTerminalIcon, renameTerminalIcon } from '../../../terminal/browser/terminalIcons.js';
import { getColorClass, getIconId, getUriClasses } from '../../../terminal/browser/terminalIcon.js';
import { terminalStrings } from '../../../terminal/common/terminalStrings.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
let terminalPicks = [];
let TerminalQuickAccessProvider = class TerminalQuickAccessProvider extends PickerQuickAccessProvider {
    static { TerminalQuickAccessProvider_1 = this; }
    static { this.PREFIX = 'term '; }
    constructor(_commandService, _editorService, _instantiationService, _terminalEditorService, _terminalGroupService, _terminalService, _themeService) {
        super(TerminalQuickAccessProvider_1.PREFIX, { canAcceptInBackground: true });
        this._commandService = _commandService;
        this._editorService = _editorService;
        this._instantiationService = _instantiationService;
        this._terminalEditorService = _terminalEditorService;
        this._terminalGroupService = _terminalGroupService;
        this._terminalService = _terminalService;
        this._themeService = _themeService;
    }
    _getPicks(filter) {
        terminalPicks = [];
        terminalPicks.push({ type: 'separator', label: 'panel' });
        const terminalGroups = this._terminalGroupService.groups;
        for (let groupIndex = 0; groupIndex < terminalGroups.length; groupIndex++) {
            const terminalGroup = terminalGroups[groupIndex];
            for (let terminalIndex = 0; terminalIndex < terminalGroup.terminalInstances.length; terminalIndex++) {
                const terminal = terminalGroup.terminalInstances[terminalIndex];
                const pick = this._createPick(terminal, terminalIndex, filter, { groupIndex, groupSize: terminalGroup.terminalInstances.length });
                if (pick) {
                    terminalPicks.push(pick);
                }
            }
        }
        if (terminalPicks.length > 0) {
            terminalPicks.push({ type: 'separator', label: 'editor' });
        }
        const terminalEditors = this._terminalEditorService.instances;
        for (let editorIndex = 0; editorIndex < terminalEditors.length; editorIndex++) {
            const term = terminalEditors[editorIndex];
            term.target = TerminalLocation.Editor;
            const pick = this._createPick(term, editorIndex, filter);
            if (pick) {
                terminalPicks.push(pick);
            }
        }
        if (terminalPicks.length > 0) {
            terminalPicks.push({ type: 'separator' });
        }
        const createTerminalLabel = localize("workbench.action.terminal.newplus", "Create New Terminal");
        terminalPicks.push({
            label: `$(plus) ${createTerminalLabel}`,
            ariaLabel: createTerminalLabel,
            accept: () => this._commandService.executeCommand("workbench.action.terminal.new" /* TerminalCommandId.New */)
        });
        const createWithProfileLabel = localize("workbench.action.terminal.newWithProfilePlus", "Create New Terminal With Profile...");
        terminalPicks.push({
            label: `$(plus) ${createWithProfileLabel}`,
            ariaLabel: createWithProfileLabel,
            accept: () => this._commandService.executeCommand("workbench.action.terminal.newWithProfile" /* TerminalCommandId.NewWithProfile */)
        });
        return terminalPicks;
    }
    _createPick(terminal, terminalIndex, filter, groupInfo) {
        const iconId = this._instantiationService.invokeFunction(getIconId, terminal);
        const index = groupInfo
            ? (groupInfo.groupSize > 1
                ? `${groupInfo.groupIndex + 1}.${terminalIndex + 1}`
                : `${groupInfo.groupIndex + 1}`)
            : `${terminalIndex + 1}`;
        const label = `$(${iconId}) ${index}: ${terminal.title}`;
        const iconClasses = [];
        const colorClass = getColorClass(terminal);
        if (colorClass) {
            iconClasses.push(colorClass);
        }
        const uriClasses = getUriClasses(terminal, this._themeService.getColorTheme().type);
        if (uriClasses) {
            iconClasses.push(...uriClasses);
        }
        const highlights = matchesFuzzy(filter, label, true);
        if (highlights) {
            return {
                label,
                description: terminal.description,
                highlights: { label: highlights },
                buttons: [
                    {
                        iconClass: ThemeIcon.asClassName(renameTerminalIcon),
                        tooltip: localize('renameTerminal', "Rename Terminal")
                    },
                    {
                        iconClass: ThemeIcon.asClassName(killTerminalIcon),
                        tooltip: terminalStrings.kill.value
                    }
                ],
                iconClasses,
                trigger: buttonIndex => {
                    switch (buttonIndex) {
                        case 0:
                            this._commandService.executeCommand("workbench.action.terminal.rename" /* TerminalCommandId.Rename */, terminal);
                            return TriggerAction.NO_ACTION;
                        case 1:
                            this._terminalService.safeDisposeTerminal(terminal);
                            return TriggerAction.REMOVE_ITEM;
                    }
                    return TriggerAction.NO_ACTION;
                },
                accept: (keyMod, event) => {
                    if (terminal.target === TerminalLocation.Editor) {
                        const existingEditors = this._editorService.findEditors(terminal.resource);
                        this._terminalEditorService.openEditor(terminal, { viewColumn: existingEditors?.[0].groupId });
                        this._terminalEditorService.setActiveInstance(terminal);
                    }
                    else {
                        this._terminalGroupService.showPanel(!event.inBackground);
                        this._terminalGroupService.setActiveInstance(terminal);
                    }
                }
            };
        }
        return undefined;
    }
};
TerminalQuickAccessProvider = TerminalQuickAccessProvider_1 = __decorate([
    __param(0, ICommandService),
    __param(1, IEditorService),
    __param(2, IInstantiationService),
    __param(3, ITerminalEditorService),
    __param(4, ITerminalGroupService),
    __param(5, ITerminalService),
    __param(6, IThemeService)
], TerminalQuickAccessProvider);
export { TerminalQuickAccessProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxRdWlja0FjY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9xdWlja0FjY2Vzcy9icm93c2VyL3Rlcm1pbmFsUXVpY2tBY2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUVqRCxPQUFPLEVBQTBCLHlCQUF5QixFQUFFLGFBQWEsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ25KLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUscUJBQXFCLEVBQXFCLGdCQUFnQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDM0ksT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRXRGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGtCQUFrQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDbEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNyRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxJQUFJLGFBQWEsR0FBd0Qs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