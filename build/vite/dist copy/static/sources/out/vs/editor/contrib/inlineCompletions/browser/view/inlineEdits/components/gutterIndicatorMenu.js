/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
import { n } from '../../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../../base/browser/ui/actionbar/actionbar.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { KeybindingLabel } from '../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { autorun, constObservable, derived, observableFromEvent, observableValue } from '../../../../../../../base/common/observable.js';
import { OS } from '../../../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { nativeHoverDelegate } from '../../../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { defaultKeybindingLabelStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable, descriptionForeground, editorActionListForeground, editorHoverBorder } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { hideInlineCompletionId, inlineSuggestCommitAlternativeActionId, inlineSuggestCommitId, toggleShowCollapsedId } from '../../../controller/commandIds.js';
let GutterIndicatorMenuContent = class GutterIndicatorMenuContent {
    constructor(_editorObs, _data, _close, _contextKeyService, _keybindingService, _commandService) {
        this._editorObs = _editorObs;
        this._data = _data;
        this._close = _close;
        this._contextKeyService = _contextKeyService;
        this._keybindingService = _keybindingService;
        this._commandService = _commandService;
        this._inlineEditsShowCollapsed = this._editorObs.getOption(71 /* EditorOption.inlineSuggest */).map(s => s.edits.showCollapsed);
    }
    toDisposableLiveElement() {
        return this._createHoverContent().toDisposableLiveElement();
    }
    _createHoverContent() {
        const activeElement = observableValue('active', undefined);
        const createOptionArgs = (options) => {
            return {
                title: options.title,
                icon: options.icon,
                keybinding: typeof options.commandId === 'string' ? this._getKeybinding(options.commandArgs ? undefined : options.commandId) : derived(this, reader => typeof options.commandId === 'string' ? undefined : this._getKeybinding(options.commandArgs ? undefined : options.commandId.read(reader)).read(reader)),
                isActive: activeElement.map(v => v === options.id),
                onHoverChange: v => activeElement.set(v ? options.id : undefined, undefined),
                onAction: () => {
                    const commandId = typeof options.commandId === 'string' ? options.commandId : options.commandId.get();
                    this._close(true, commandId);
                    return this._commandService.executeCommand(commandId, ...(options.commandArgs ?? []));
                },
            };
        };
        const extensionCommandGroups = this._data.extensionCommands.map(group => group.map((c, idx) => option(createOptionArgs({
            id: c.command.id + '_' + idx,
            title: c.command.title,
            icon: c.icon ?? Codicon.symbolEvent,
            commandId: c.command.id,
            commandArgs: c.command.arguments
        }))));
        const extensionCommandNodes = [];
        for (const group of extensionCommandGroups) {
            if (group.length > 0) {
                extensionCommandNodes.push(separator());
                extensionCommandNodes.push(...group);
            }
        }
        if (this._data.extensionCommandsOnly) {
            // drop leading separator
            return hoverContent(extensionCommandNodes.slice(1));
        }
        const title = header(this._data.displayName);
        const gotoAndAccept = option(createOptionArgs({
            id: 'gotoAndAccept',
            title: localize('gotoAndAccept', "Go To / Accept"),
            icon: Codicon.check,
            commandId: inlineSuggestCommitId,
        }));
        const reject = option(createOptionArgs({
            id: 'reject',
            title: localize('reject', "Reject"),
            icon: Codicon.close,
            commandId: hideInlineCompletionId
        }));
        const alternativeCommand = this._data.alternativeAction ? option(createOptionArgs({
            id: 'alternativeCommand',
            title: this._data.alternativeAction.command.title,
            icon: this._data.alternativeAction.icon,
            commandId: inlineSuggestCommitAlternativeActionId,
        })) : undefined;
        const showModelEnabled = false;
        const modelOptions = showModelEnabled ? this._data.modelInfo?.models.map((m) => option({
            title: m.name,
            icon: m.id === this._data.modelInfo?.currentModelId ? Codicon.check : Codicon.circle,
            keybinding: constObservable(undefined),
            isActive: activeElement.map(v => v === 'model_' + m.id),
            onHoverChange: v => activeElement.set(v ? 'model_' + m.id : undefined, undefined),
            onAction: () => {
                this._close(true);
                this._data.setModelId?.(m.id);
            },
        })) ?? [] : [];
        const toggleCollapsedMode = this._inlineEditsShowCollapsed.map(showCollapsed => showCollapsed ?
            option(createOptionArgs({
                id: 'showExpanded',
                title: localize('showExpanded', "Show Expanded"),
                icon: Codicon.expandAll,
                commandId: toggleShowCollapsedId
            }))
            : option(createOptionArgs({
                id: 'showCollapsed',
                title: localize('showCollapsed', "Show Collapsed"),
                icon: Codicon.collapseAll,
                commandId: toggleShowCollapsedId
            })));
        const snooze = option(createOptionArgs({
            id: 'snooze',
            title: localize('snooze', "Snooze"),
            icon: Codicon.bellSlash,
            commandId: 'editor.action.inlineSuggest.snooze'
        }));
        const settings = option(createOptionArgs({
            id: 'settings',
            title: localize('settings', "Settings"),
            icon: Codicon.gear,
            commandId: 'workbench.action.openSettings',
            commandArgs: ['@tag:nextEditSuggestions']
        }));
        const actions = this._data.action ? [this._data.action] : [];
        const actionBarFooter = actions.length > 0 ? actionBar(actions.map(action => ({
            id: action.id,
            label: action.title + '...',
            enabled: true,
            run: () => this._commandService.executeCommand(action.id, ...(action.arguments ?? [])),
            class: undefined,
            tooltip: action.tooltip ?? action.title
        })), { hoverDelegate: nativeHoverDelegate /* unable to show hover inside another hover */ }) : undefined;
        return hoverContent([
            title,
            gotoAndAccept,
            alternativeCommand,
            reject,
            toggleCollapsedMode,
            modelOptions.length ? separator() : undefined,
            ...modelOptions,
            snooze,
            settings,
            ...extensionCommandNodes,
            actionBarFooter ? separator() : undefined,
            actionBarFooter
        ]);
    }
    _getKeybinding(commandId) {
        if (!commandId) {
            return constObservable(undefined);
        }
        return observableFromEvent(this._contextKeyService.onDidChangeContext, () => this._keybindingService.lookupKeybinding(commandId)); // TODO: use contextkeyservice to use different renderings
    }
};
GutterIndicatorMenuContent = __decorate([
    __param(3, IContextKeyService),
    __param(4, IKeybindingService),
    __param(5, ICommandService)
], GutterIndicatorMenuContent);
export { GutterIndicatorMenuContent };
function hoverContent(content) {
    return n.div({
        class: 'content',
        style: {
            margin: 4,
            minWidth: 180,
        }
    }, content);
}
function header(title) {
    return n.div({
        class: 'header',
        style: {
            color: asCssVariable(descriptionForeground),
            fontSize: '13px',
            fontWeight: '600',
            padding: '0 4px',
            lineHeight: 28,
        }
    }, [title]);
}
function option(props) {
    return derived({ name: 'inlineEdits.option' }, (_reader) => n.div({
        class: ['monaco-menu-option', props.isActive?.map(v => v && 'active')],
        onmouseenter: () => props.onHoverChange?.(true),
        onmouseleave: () => props.onHoverChange?.(false),
        onclick: props.onAction,
        onkeydown: e => {
            if (e.key === 'Enter') {
                props.onAction?.();
            }
        },
        tabIndex: 0,
        style: {
            borderRadius: 3, // same as hover widget border radius
        }
    }, [
        n.elem('span', {
            style: {
                fontSize: 16,
                display: 'flex',
            }
        }, [ThemeIcon.isThemeIcon(props.icon) ? renderIcon(props.icon) : props.icon.map(icon => renderIcon(icon))]),
        n.elem('span', {}, [props.title]),
        n.div({
            style: { marginLeft: 'auto' },
            ref: elem => {
                const keybindingLabel = _reader.store.add(new KeybindingLabel(elem, OS, {
                    disableTitle: true,
                    ...defaultKeybindingLabelStyles,
                    keybindingLabelShadow: undefined,
                    keybindingLabelForeground: asCssVariable(descriptionForeground),
                    keybindingLabelBackground: 'transparent',
                    keybindingLabelBorder: 'transparent',
                    keybindingLabelBottomBorder: undefined,
                }));
                _reader.store.add(autorun(reader => {
                    keybindingLabel.set(props.keybinding.read(reader));
                }));
            }
        })
    ]));
}
// TODO: make this observable
function actionBar(actions, options) {
    return derived({ name: 'inlineEdits.actionBar' }, (_reader) => n.div({
        class: ['action-widget-action-bar'],
        style: {
            padding: '3px 24px',
        }
    }, [
        n.div({
            ref: elem => {
                const actionBar = _reader.store.add(new ActionBar(elem, options));
                actionBar.push(actions, { icon: false, label: true });
            }
        })
    ]));
}
function separator() {
    return n.div({
        id: 'inline-edit-gutter-indicator-menu-separator',
        class: 'menu-separator',
        style: {
            color: asCssVariable(editorActionListForeground),
            padding: '2px 0',
        }
    }, n.div({
        style: {
            borderBottom: `1px solid ${asCssVariable(editorHoverBorder)}`,
        }
    }));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3V0dGVySW5kaWNhdG9yTWVudS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9jb21wb25lbnRzL2d1dHRlckluZGljYXRvck1lbnUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEc7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUEwQixDQUFDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNyRixPQUFPLEVBQUUsU0FBUyxFQUFxQixNQUFNLDZEQUE2RCxDQUFDO0FBQzNHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFFMUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRXZFLE9BQU8sRUFBZSxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN0SixPQUFPLEVBQUUsRUFBRSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDNUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDbkcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDM0YsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDbkcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDNUcsT0FBTyxFQUFFLGFBQWEsRUFBRSxxQkFBcUIsRUFBRSwwQkFBMEIsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBR2xLLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxzQ0FBc0MsRUFBRSxxQkFBcUIsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBSTFKLElBQU0sMEJBQTBCLEdBQWhDLE1BQU0sMEJBQTBCO0lBR3RDLFlBQ2tCLFVBQWdDLEVBQ2hDLEtBQXFDLEVBQ3JDLE1BQTBELEVBQ3RDLGtCQUFzQyxFQUN0QyxrQkFBc0MsRUFDekMsZUFBZ0M7UUFMakQsZUFBVSxHQUFWLFVBQVUsQ0FBc0I7UUFDaEMsVUFBSyxHQUFMLEtBQUssQ0FBZ0M7UUFDckMsV0FBTSxHQUFOLE1BQU0sQ0FBb0Q7UUFDdEMsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUN0Qyx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBQ3pDLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQUVsRSxJQUFJLENBQUMseUJBQXlCLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLHFDQUE0QixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDeEgsQ0FBQztJQUVNLHVCQUF1QjtRQUM3QixPQUFPLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLHVCQUF1QixFQUFFLENBQUM7SUFDN0QsQ0FBQztJQUVPLG1CQUFtQjtRQUMxQixNQUFNLGFBQWEsR0FBRyxlQUFlLENBQXFCLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUUvRSxNQUFNLGdCQUFnQixHQUFHLENBQUMsT0FBa0osRUFBNkIsRUFBRTtZQUMxTSxPQUFPO2dCQUNOLEtBQUssRUFBRSxPQUFPLENBQUMsS0FBSztnQkFDcEIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJO2dCQUNsQixVQUFVLEVBQUUsT0FBTyxPQUFPLENBQUMsU0FBUyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sT0FBTyxDQUFDLFNBQVMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUM5UyxRQUFRLEVBQUUsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNsRCxhQUFhLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQztnQkFDNUUsUUFBUSxFQUFFLEdBQUcsRUFBRTtvQkFDZCxNQUFNLFNBQVMsR0FBRyxPQUFPLE9BQU8sQ0FBQyxTQUFTLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxDQUFDO29CQUN0RyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztvQkFDN0IsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLE9BQU8sQ0FBQyxXQUFXLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDdkYsQ0FBQzthQUNELENBQUM7UUFDSCxDQUFDLENBQUM7UUFFRixNQUFNLHNCQUFzQixHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQ3ZFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUM7WUFDN0MsRUFBRSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxHQUFHLEdBQUcsR0FBRyxHQUFHO1lBQzVCLEtBQUssRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUs7WUFDdEIsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksT0FBTyxDQUFDLFdBQVc7WUFDbkMsU0FBUyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUN2QixXQUFXLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxTQUFTO1NBQ2hDLENBQUMsQ0FBQyxDQUFDLENBQ0osQ0FBQztRQUVGLE1BQU0scUJBQXFCLEdBQWMsRUFBRSxDQUFDO1FBQzVDLEtBQUssTUFBTSxLQUFLLElBQUksc0JBQXNCLEVBQUUsQ0FBQztZQUM1QyxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RCLHFCQUFxQixDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQztZQUN0QyxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQ3RDLHlCQUF5QjtZQUN6QixPQUFPLFlBQVksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyRCxDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFN0MsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLGdCQUFnQixDQUFDO1lBQzdDLEVBQUUsRUFBRSxlQUFlO1lBQ25CLEtBQUssRUFBRSxRQUFRLENBQUMsZUFBZSxFQUFFLGdCQUFnQixDQUFDO1lBQ2xELElBQUksRUFBRSxPQUFPLENBQUMsS0FBSztZQUNuQixTQUFTLEVBQUUscUJBQXFCO1NBQ2hDLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLGdCQUFnQixDQUFDO1lBQ3RDLEVBQUUsRUFBRSxRQUFRO1lBQ1osS0FBSyxFQUFFLFFBQVEsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDO1lBQ25DLElBQUksRUFBRSxPQUFPLENBQUMsS0FBSztZQUNuQixTQUFTLEVBQUUsc0JBQXNCO1NBQ2pDLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUM7WUFDakYsRUFBRSxFQUFFLG9CQUFvQjtZQUN4QixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsS0FBSztZQUNqRCxJQUFJLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJO1lBQ3ZDLFNBQVMsRUFBRSxzQ0FBc0M7U0FDakQsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUVoQixNQUFNLGdCQUFnQixHQUFHLEtBQUssQ0FBQztRQUMvQixNQUFNLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQStCLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQztZQUNwSCxLQUFLLEVBQUUsQ0FBQyxDQUFDLElBQUk7WUFDYixJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNO1lBQ3BGLFVBQVUsRUFBRSxlQUFlLENBQUMsU0FBUyxDQUFDO1lBQ3RDLFFBQVEsRUFBRSxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLFFBQVEsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3ZELGFBQWEsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQztZQUNqRixRQUFRLEVBQUUsR0FBRyxFQUFFO2dCQUNkLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ2xCLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQy9CLENBQUM7U0FDRCxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUVmLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQzlGLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQztnQkFDdkIsRUFBRSxFQUFFLGNBQWM7Z0JBQ2xCLEtBQUssRUFBRSxRQUFRLENBQUMsY0FBYyxFQUFFLGVBQWUsQ0FBQztnQkFDaEQsSUFBSSxFQUFFLE9BQU8sQ0FBQyxTQUFTO2dCQUN2QixTQUFTLEVBQUUscUJBQXFCO2FBQ2hDLENBQUMsQ0FBQztZQUNILENBQUMsQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUM7Z0JBQ3pCLEVBQUUsRUFBRSxlQUFlO2dCQUNuQixLQUFLLEVBQUUsUUFBUSxDQUFDLGVBQWUsRUFBRSxnQkFBZ0IsQ0FBQztnQkFDbEQsSUFBSSxFQUFFLE9BQU8sQ0FBQyxXQUFXO2dCQUN6QixTQUFTLEVBQUUscUJBQXFCO2FBQ2hDLENBQUMsQ0FBQyxDQUNILENBQUM7UUFFRixNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsZ0JBQWdCLENBQUM7WUFDdEMsRUFBRSxFQUFFLFFBQVE7WUFDWixLQUFLLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUM7WUFDbkMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxTQUFTO1lBQ3ZCLFNBQVMsRUFBRSxvQ0FBb0M7U0FDL0MsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsZ0JBQWdCLENBQUM7WUFDeEMsRUFBRSxFQUFFLFVBQVU7WUFDZCxLQUFLLEVBQUUsUUFBUSxDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUM7WUFDdkMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJO1lBQ2xCLFNBQVMsRUFBRSwrQkFBK0I7WUFDMUMsV0FBVyxFQUFFLENBQUMsMEJBQTBCLENBQUM7U0FDekMsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDN0QsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FDckQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdEIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxFQUFFO1lBQ2IsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLLEdBQUcsS0FBSztZQUMzQixPQUFPLEVBQUUsSUFBSTtZQUNiLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ3RGLEtBQUssRUFBRSxTQUFTO1lBQ2hCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxJQUFJLE1BQU0sQ0FBQyxLQUFLO1NBQ3ZDLENBQUMsQ0FBQyxFQUNILEVBQUUsYUFBYSxFQUFFLG1CQUFtQixDQUFDLCtDQUErQyxFQUFFLENBQ3RGLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUVkLE9BQU8sWUFBWSxDQUFDO1lBQ25CLEtBQUs7WUFDTCxhQUFhO1lBQ2Isa0JBQWtCO1lBQ2xCLE1BQU07WUFDTixtQkFBbUI7WUFDbkIsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDN0MsR0FBRyxZQUFZO1lBQ2YsTUFBTTtZQUNOLFFBQVE7WUFFUixHQUFHLHFCQUFxQjtZQUV4QixlQUFlLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQ3pDLGVBQWU7U0FDZixDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8sY0FBYyxDQUFDLFNBQTZCO1FBQ25ELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoQixPQUFPLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNuQyxDQUFDO1FBQ0QsT0FBTyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQywwREFBMEQ7SUFDOUwsQ0FBQztDQUNELENBQUE7QUFsS1ksMEJBQTBCO0lBT3BDLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGVBQWUsQ0FBQTtHQVRMLDBCQUEwQixDQWtLdEM7O0FBRUQsU0FBUyxZQUFZLENBQUMsT0FBa0I7SUFDdkMsT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQ1osS0FBSyxFQUFFLFNBQVM7UUFDaEIsS0FBSyxFQUFFO1lBQ04sTUFBTSxFQUFFLENBQUM7WUFDVCxRQUFRLEVBQUUsR0FBRztTQUNiO0tBQ0QsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUNiLENBQUM7QUFFRCxTQUFTLE1BQU0sQ0FBQyxLQUFtQztJQUNsRCxPQUFPLENBQUMsQ0FBQyxHQUFHLENBQUM7UUFDWixLQUFLLEVBQUUsUUFBUTtRQUNmLEtBQUssRUFBRTtZQUNOLEtBQUssRUFBRSxhQUFhLENBQUMscUJBQXFCLENBQUM7WUFDM0MsUUFBUSxFQUFFLE1BQU07WUFDaEIsVUFBVSxFQUFFLEtBQUs7WUFDakIsT0FBTyxFQUFFLE9BQU87WUFDaEIsVUFBVSxFQUFFLEVBQUU7U0FDZDtLQUNELEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ2IsQ0FBQztBQUVELFNBQVMsTUFBTSxDQUFDLEtBT2Y7SUFDQSxPQUFPLE9BQU8sQ0FBQyxFQUFFLElBQUksRUFBRSxvQkFBb0IsRUFBRSxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQ2pFLEtBQUssRUFBRSxDQUFDLG9CQUFvQixFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDO1FBQ3RFLFlBQVksRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsYUFBYSxFQUFFLENBQUMsSUFBSSxDQUFDO1FBQy9DLFlBQVksRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsYUFBYSxFQUFFLENBQUMsS0FBSyxDQUFDO1FBQ2hELE9BQU8sRUFBRSxLQUFLLENBQUMsUUFBUTtRQUN2QixTQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUU7WUFDZCxJQUFJLENBQUMsQ0FBQyxHQUFHLEtBQUssT0FBTyxFQUFFLENBQUM7Z0JBQ3ZCLEtBQUssQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO1lBQ3BCLENBQUM7UUFDRixDQUFDO1FBQ0QsUUFBUSxFQUFFLENBQUM7UUFDWCxLQUFLLEVBQUU7WUFDTixZQUFZLEVBQUUsQ0FBQyxFQUFFLHFDQUFxQztTQUN0RDtLQUNELEVBQUU7UUFDRixDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUNkLEtBQUssRUFBRTtnQkFDTixRQUFRLEVBQUUsRUFBRTtnQkFDWixPQUFPLEVBQUUsTUFBTTthQUNmO1NBQ0QsRUFBRSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0csQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2pDLENBQUMsQ0FBQyxHQUFHLENBQUM7WUFDTCxLQUFLLEVBQUUsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFO1lBQzdCLEdBQUcsRUFBRSxJQUFJLENBQUMsRUFBRTtnQkFDWCxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGVBQWUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFO29CQUN2RSxZQUFZLEVBQUUsSUFBSTtvQkFDbEIsR0FBRyw0QkFBNEI7b0JBQy9CLHFCQUFxQixFQUFFLFNBQVM7b0JBQ2hDLHlCQUF5QixFQUFFLGFBQWEsQ0FBQyxxQkFBcUIsQ0FBQztvQkFDL0QseUJBQXlCLEVBQUUsYUFBYTtvQkFDeEMscUJBQXFCLEVBQUUsYUFBYTtvQkFDcEMsMkJBQTJCLEVBQUUsU0FBUztpQkFDdEMsQ0FBQyxDQUFDLENBQUM7Z0JBQ0osT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO29CQUNsQyxlQUFlLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ3BELENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDTCxDQUFDO1NBQ0QsQ0FBQztLQUNGLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQUVELDZCQUE2QjtBQUM3QixTQUFTLFNBQVMsQ0FBQyxPQUFrQixFQUFFLE9BQTBCO0lBQ2hFLE9BQU8sT0FBTyxDQUFDLEVBQUUsSUFBSSxFQUFFLHVCQUF1QixFQUFFLEVBQUUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7UUFDcEUsS0FBSyxFQUFFLENBQUMsMEJBQTBCLENBQUM7UUFDbkMsS0FBSyxFQUFFO1lBQ04sT0FBTyxFQUFFLFVBQVU7U0FDbkI7S0FDRCxFQUFFO1FBQ0YsQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUNMLEdBQUcsRUFBRSxJQUFJLENBQUMsRUFBRTtnQkFDWCxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDbEUsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZELENBQUM7U0FDRCxDQUFDO0tBQ0YsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQsU0FBUyxTQUFTO0lBQ2pCLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQztRQUNaLEVBQUUsRUFBRSw2Q0FBNkM7UUFDakQsS0FBSyxFQUFFLGdCQUFnQjtRQUN2QixLQUFLLEVBQUU7WUFDTixLQUFLLEVBQUUsYUFBYSxDQUFDLDBCQUEwQixDQUFDO1lBQ2hELE9BQU8sRUFBRSxPQUFPO1NBQ2hCO0tBQ0QsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQ1IsS0FBSyxFQUFFO1lBQ04sWUFBWSxFQUFFLGFBQWEsYUFBYSxDQUFDLGlCQUFpQixDQUFDLEVBQUU7U0FDN0Q7S0FDRCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMifQ==