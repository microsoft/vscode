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
var InlineSuggestionHintsContentWidget_1;
import { h, n } from '../../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { KeybindingLabel, unthemedKeybindingLabelOptions } from '../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { Action, Separator } from '../../../../../base/common/actions.js';
import { equals } from '../../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { createHotClass } from '../../../../../base/common/hotReloadHelpers.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, derived, derivedObservableWithCache, observableFromEvent } from '../../../../../base/common/observable.js';
import { OS } from '../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { MenuEntryActionViewItem, getActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { Position } from '../../../../common/core/position.js';
import { InlineCompletionTriggerKind } from '../../../../common/languages.js';
import { showNextInlineSuggestionActionId, showPreviousInlineSuggestionActionId } from '../controller/commandIds.js';
import './inlineCompletionsHintsWidget.css';
let InlineCompletionsHintsWidget = class InlineCompletionsHintsWidget extends Disposable {
    constructor(editor, model, instantiationService) {
        super();
        this.editor = editor;
        this.model = model;
        this.instantiationService = instantiationService;
        this.alwaysShowToolbar = observableFromEvent(this, this.editor.onDidChangeConfiguration, () => this.editor.getOption(71 /* EditorOption.inlineSuggest */).showToolbar === 'always');
        this.sessionPosition = undefined;
        this.position = derived(this, reader => {
            const ghostText = this.model.read(reader)?.primaryGhostText.read(reader);
            if (!this.alwaysShowToolbar.read(reader) || !ghostText || ghostText.parts.length === 0) {
                this.sessionPosition = undefined;
                return null;
            }
            const firstColumn = ghostText.parts[0].column;
            if (this.sessionPosition && this.sessionPosition.lineNumber !== ghostText.lineNumber) {
                this.sessionPosition = undefined;
            }
            const position = new Position(ghostText.lineNumber, Math.min(firstColumn, this.sessionPosition?.column ?? Number.MAX_SAFE_INTEGER));
            this.sessionPosition = position;
            return position;
        });
        this._register(autorunWithStore((reader, store) => {
            /** @description setup content widget */
            const model = this.model.read(reader);
            if (!model || !this.alwaysShowToolbar.read(reader)) {
                return;
            }
            const contentWidgetValue = derived((reader) => {
                const contentWidget = reader.store.add(this.instantiationService.createInstance(InlineSuggestionHintsContentWidget.hot.read(reader), this.editor, true, this.position, model.selectedInlineCompletionIndex, model.inlineCompletionsCount, model.activeCommands, model.warning, () => { }));
                editor.addContentWidget(contentWidget);
                reader.store.add(toDisposable(() => editor.removeContentWidget(contentWidget)));
                reader.store.add(autorun(reader => {
                    /** @description request explicit */
                    const position = this.position.read(reader);
                    if (!position) {
                        return;
                    }
                    if (model.lastTriggerKind.read(reader) !== InlineCompletionTriggerKind.Explicit) {
                        model.triggerExplicitly();
                    }
                }));
                return contentWidget;
            });
            const hadPosition = derivedObservableWithCache(this, (reader, lastValue) => !!this.position.read(reader) || !!lastValue);
            store.add(autorun(reader => {
                if (hadPosition.read(reader)) {
                    contentWidgetValue.read(reader);
                }
            }));
        }));
    }
};
InlineCompletionsHintsWidget = __decorate([
    __param(2, IInstantiationService)
], InlineCompletionsHintsWidget);
export { InlineCompletionsHintsWidget };
const inlineSuggestionHintsNextIcon = registerIcon('inline-suggestion-hints-next', Codicon.chevronRight, localize('parameterHintsNextIcon', 'Icon for show next parameter hint.'));
const inlineSuggestionHintsPreviousIcon = registerIcon('inline-suggestion-hints-previous', Codicon.chevronLeft, localize('parameterHintsPreviousIcon', 'Icon for show previous parameter hint.'));
let InlineSuggestionHintsContentWidget = class InlineSuggestionHintsContentWidget extends Disposable {
    static { InlineSuggestionHintsContentWidget_1 = this; }
    static { this.hot = createHotClass(this); }
    static { this._dropDownVisible = false; }
    static get dropDownVisible() { return this._dropDownVisible; }
    static { this.id = 0; }
    createCommandAction(commandId, label, iconClassName) {
        const action = new Action(commandId, label, iconClassName, true, () => this._commandService.executeCommand(commandId));
        action.tooltip = this.keybindingService.appendKeybinding(label, commandId, this._contextKeyService);
        return action;
    }
    constructor(editor, withBorder, _position, _currentSuggestionIdx, _suggestionCount, _extraCommands, _warning, _relayout, _commandService, instantiationService, keybindingService, _contextKeyService, _menuService) {
        super();
        this.editor = editor;
        this.withBorder = withBorder;
        this._position = _position;
        this._currentSuggestionIdx = _currentSuggestionIdx;
        this._suggestionCount = _suggestionCount;
        this._extraCommands = _extraCommands;
        this._warning = _warning;
        this._relayout = _relayout;
        this._commandService = _commandService;
        this.keybindingService = keybindingService;
        this._contextKeyService = _contextKeyService;
        this._menuService = _menuService;
        this.id = `InlineSuggestionHintsContentWidget${InlineSuggestionHintsContentWidget_1.id++}`;
        this.allowEditorOverflow = true;
        this.suppressMouseDown = false;
        this._warningMessageContentNode = derived((reader) => {
            const warning = this._warning.read(reader);
            if (!warning) {
                return undefined;
            }
            if (typeof warning.message === 'string') {
                return warning.message;
            }
            const markdownElement = reader.store.add(renderMarkdown(warning.message));
            return markdownElement.element;
        });
        this._warningMessageNode = n.div({
            class: 'warningMessage',
            style: {
                maxWidth: 400,
                margin: 4,
                marginBottom: 4,
                display: derived(reader => this._warning.read(reader) ? 'block' : 'none'),
            }
        }, [
            this._warningMessageContentNode,
        ]).keepUpdated(this._store);
        this.nodes = h('div.inlineSuggestionsHints', { className: this.withBorder ? 'monaco-hover monaco-hover-content' : '' }, [
            this._warningMessageNode.element,
            h('div@toolBar'),
        ]);
        this.previousAction = this._register(this.createCommandAction(showPreviousInlineSuggestionActionId, localize('previous', 'Previous'), ThemeIcon.asClassName(inlineSuggestionHintsPreviousIcon)));
        this.availableSuggestionCountAction = this._register(new Action('inlineSuggestionHints.availableSuggestionCount', '', undefined, false));
        this.nextAction = this._register(this.createCommandAction(showNextInlineSuggestionActionId, localize('next', 'Next'), ThemeIcon.asClassName(inlineSuggestionHintsNextIcon)));
        this.inlineCompletionsActionsMenus = this._register(this._menuService.createMenu(MenuId.InlineCompletionsActions, this._contextKeyService));
        this.clearAvailableSuggestionCountLabelDebounced = this._register(new RunOnceScheduler(() => {
            this.availableSuggestionCountAction.label = '';
        }, 100));
        this.disableButtonsDebounced = this._register(new RunOnceScheduler(() => {
            this.previousAction.enabled = this.nextAction.enabled = false;
        }, 100));
        this._register(autorun(reader => {
            this._warningMessageContentNode.read(reader);
            this._warningMessageNode.readEffect(reader);
            // Only update after the warning message node has been rendered
            this._relayout();
        }));
        this.toolBar = this._register(instantiationService.createInstance(CustomizedMenuWorkbenchToolBar, this.nodes.toolBar, MenuId.InlineSuggestionToolbar, {
            menuOptions: { renderShortTitle: true },
            toolbarOptions: { primaryGroup: g => g.startsWith('primary') },
            actionViewItemProvider: (action, options) => {
                if (action instanceof MenuItemAction) {
                    return instantiationService.createInstance(StatusBarViewItem, action, undefined);
                }
                if (action === this.availableSuggestionCountAction) {
                    const a = new ActionViewItemWithClassName(undefined, action, { label: true, icon: false });
                    a.setClass('availableSuggestionCount');
                    return a;
                }
                return undefined;
            },
            telemetrySource: 'InlineSuggestionToolbar',
        }));
        this.toolBar.setPrependedPrimaryActions([
            this.previousAction,
            this.availableSuggestionCountAction,
            this.nextAction,
        ]);
        this._register(this.toolBar.onDidChangeDropdownVisibility(e => {
            InlineSuggestionHintsContentWidget_1._dropDownVisible = e;
        }));
        this._register(autorun(reader => {
            /** @description update position */
            this._position.read(reader);
            this.editor.layoutContentWidget(this);
        }));
        this._register(autorun(reader => {
            /** @description counts */
            const suggestionCount = this._suggestionCount.read(reader);
            const currentSuggestionIdx = this._currentSuggestionIdx.read(reader);
            if (suggestionCount !== undefined) {
                this.clearAvailableSuggestionCountLabelDebounced.cancel();
                this.availableSuggestionCountAction.label = `${currentSuggestionIdx + 1}/${suggestionCount}`;
            }
            else {
                this.clearAvailableSuggestionCountLabelDebounced.schedule();
            }
            if (suggestionCount !== undefined && suggestionCount > 1) {
                this.disableButtonsDebounced.cancel();
                this.previousAction.enabled = this.nextAction.enabled = true;
            }
            else {
                this.disableButtonsDebounced.schedule();
            }
        }));
        this._register(autorun(reader => {
            /** @description extra commands */
            const extraCommands = this._extraCommands.read(reader);
            const extraActions = extraCommands.map(c => ({
                class: undefined,
                id: c.command.id,
                enabled: true,
                tooltip: c.command.tooltip || '',
                label: c.command.title,
                run: (event) => {
                    return this._commandService.executeCommand(c.command.id);
                },
            }));
            for (const [_, group] of this.inlineCompletionsActionsMenus.getActions()) {
                for (const action of group) {
                    if (action instanceof MenuItemAction) {
                        extraActions.push(action);
                    }
                }
            }
            if (extraActions.length > 0) {
                extraActions.unshift(new Separator());
            }
            this.toolBar.setAdditionalSecondaryActions(extraActions);
        }));
    }
    getId() { return this.id; }
    getDomNode() {
        return this.nodes.root;
    }
    getPosition() {
        return {
            position: this._position.get(),
            preference: [1 /* ContentWidgetPositionPreference.ABOVE */, 2 /* ContentWidgetPositionPreference.BELOW */],
            positionAffinity: 3 /* PositionAffinity.LeftOfInjectedText */,
        };
    }
};
InlineSuggestionHintsContentWidget = InlineSuggestionHintsContentWidget_1 = __decorate([
    __param(8, ICommandService),
    __param(9, IInstantiationService),
    __param(10, IKeybindingService),
    __param(11, IContextKeyService),
    __param(12, IMenuService)
], InlineSuggestionHintsContentWidget);
export { InlineSuggestionHintsContentWidget };
class ActionViewItemWithClassName extends ActionViewItem {
    constructor() {
        super(...arguments);
        this._className = undefined;
    }
    setClass(className) {
        this._className = className;
    }
    render(container) {
        super.render(container);
        if (this._className) {
            container.classList.add(this._className);
        }
    }
    updateTooltip() {
        // NOOP, disable tooltip
    }
}
class StatusBarViewItem extends MenuEntryActionViewItem {
    updateLabel() {
        const kb = this._keybindingService.lookupKeybinding(this._action.id, this._contextKeyService, true);
        if (!kb) {
            return super.updateLabel();
        }
        if (this.label) {
            const div = h('div.keybinding').root;
            const k = this._register(new KeybindingLabel(div, OS, { disableTitle: true, ...unthemedKeybindingLabelOptions }));
            k.set(kb);
            this.label.textContent = this._action.label;
            this.label.appendChild(div);
            this.label.classList.add('inlineSuggestionStatusBarItemLabel');
        }
    }
    updateTooltip() {
        // NOOP, disable tooltip
    }
}
let CustomizedMenuWorkbenchToolBar = class CustomizedMenuWorkbenchToolBar extends WorkbenchToolBar {
    constructor(container, menuId, options2, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService) {
        super(container, { resetMenu: menuId, ...options2 }, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService);
        this.menuId = menuId;
        this.options2 = options2;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.menu = this._store.add(this.menuService.createMenu(this.menuId, this.contextKeyService, { emitEventsForSubmenuChanges: true }));
        this.additionalActions = [];
        this.prependedPrimaryActions = [];
        this.additionalPrimaryActions = [];
        this._store.add(this.menu.onDidChange(() => this.updateToolbar()));
        this.updateToolbar();
    }
    updateToolbar() {
        const { primary, secondary } = getActionBarActions(this.menu.getActions(this.options2?.menuOptions), this.options2?.toolbarOptions?.primaryGroup, this.options2?.toolbarOptions?.shouldInlineSubmenu, this.options2?.toolbarOptions?.useSeparatorsInPrimaryActions);
        secondary.push(...this.additionalActions);
        primary.unshift(...this.prependedPrimaryActions);
        primary.push(...this.additionalPrimaryActions);
        this.setActions(primary, secondary);
    }
    setPrependedPrimaryActions(actions) {
        if (equals(this.prependedPrimaryActions, actions, (a, b) => a === b)) {
            return;
        }
        this.prependedPrimaryActions = actions;
        this.updateToolbar();
    }
    setAdditionalPrimaryActions(actions) {
        if (equals(this.additionalPrimaryActions, actions, (a, b) => a === b)) {
            return;
        }
        this.additionalPrimaryActions = actions;
        this.updateToolbar();
    }
    setAdditionalSecondaryActions(actions) {
        if (equals(this.additionalActions, actions, (a, b) => a === b)) {
            return;
        }
        this.additionalActions = actions;
        this.updateToolbar();
    }
};
CustomizedMenuWorkbenchToolBar = __decorate([
    __param(3, IMenuService),
    __param(4, IContextKeyService),
    __param(5, IContextMenuService),
    __param(6, IKeybindingService),
    __param(7, ICommandService),
    __param(8, ITelemetryService)
], CustomizedMenuWorkbenchToolBar);
export { CustomizedMenuWorkbenchToolBar };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ29tcGxldGlvbnNIaW50c1dpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvaGludHNXaWRnZXQvaW5saW5lQ29tcGxldGlvbnNIaW50c1dpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDakYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUNwSSxPQUFPLEVBQUUsTUFBTSxFQUFXLFNBQVMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkYsT0FBTyxFQUFlLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUM1SixPQUFPLEVBQUUsRUFBRSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5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