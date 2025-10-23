/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h, n } from '../../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { KeybindingLabel, unthemedKeybindingLabelOptions } from '../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { equals } from '../../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { createHotClass } from '../../../../../base/common/hotReloadHelpers.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, autorun, autorunWithStore, derived, derivedObservableWithCache, observableFromEvent } from '../../../../../base/common/observable.js';
import { OS } from '../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { MenuEntryActionViewItem, getActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuWorkbenchToolBarOptions, WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../browser/editorBrowser.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { Position } from '../../../../common/core/position.js';
import { InlineCompletionCommand, InlineCompletionTriggerKind, InlineCompletionWarning } from '../../../../common/languages.js';
import { PositionAffinity } from '../../../../common/model.js';
import { showNextInlineSuggestionActionId, showPreviousInlineSuggestionActionId } from '../controller/commandIds.js';
import { InlineCompletionsModel } from '../model/inlineCompletionsModel.js';
import './inlineCompletionsHintsWidget.css';

export class InlineCompletionsHintsWidget extends Disposable {
	private readonly alwaysShowToolbar;

	private sessionPosition: Position | undefined;

	private readonly position;

	constructor(
		private readonly editor: ICodeEditor,
		private readonly model: IObservable<InlineCompletionsModel | undefined>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.alwaysShowToolbar = observableFromEvent(this, this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineSuggest).showToolbar === 'always');
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
				const contentWidget = reader.store.add(this.instantiationService.createInstance(
					InlineSuggestionHintsContentWidget.hot.read(reader),
					this.editor,
					true,
					this.position,
					model.selectedInlineCompletionIndex,
					model.inlineCompletionsCount,
					model.activeCommands,
					model.warning,
					() => { },
				));
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
}

const inlineSuggestionHintsNextIcon = registerIcon('inline-suggestion-hints-next', Codicon.chevronRight, localize('parameterHintsNextIcon', 'Icon for show next parameter hint.'));
const inlineSuggestionHintsPreviousIcon = registerIcon('inline-suggestion-hints-previous', Codicon.chevronLeft, localize('parameterHintsPreviousIcon', 'Icon for show previous parameter hint.'));

export class InlineSuggestionHintsContentWidget extends Disposable implements IContentWidget {
	public static readonly hot = createHotClass(this);

	private static _dropDownVisible = false;
	public static get dropDownVisible() { return this._dropDownVisible; }

	private static id = 0;

	private readonly id;
	public readonly allowEditorOverflow;
	public readonly suppressMouseDown;

	private readonly _warningMessageContentNode;

	private readonly _warningMessageNode;

	private readonly nodes;

	private createCommandAction(commandId: string, label: string, iconClassName: string): Action {
		const action = new Action(
			commandId,
			label,
			iconClassName,
			true,
			() => this._commandService.executeCommand(commandId),
		);
		const kb = this.keybindingService.lookupKeybinding(commandId, this._contextKeyService);
		let tooltip = label;
		if (kb) {
			tooltip = localize({ key: 'content', comment: ['A label', 'A keybinding'] }, '{0} ({1})', label, kb.getLabel());
		}
		action.tooltip = tooltip;
		return action;
	}

	private readonly previousAction;
	private readonly availableSuggestionCountAction;
	private readonly nextAction;

	private readonly toolBar: CustomizedMenuWorkbenchToolBar;

	// TODO@hediet: deprecate MenuId.InlineCompletionsActions
	private readonly inlineCompletionsActionsMenus;

	private readonly clearAvailableSuggestionCountLabelDebounced;

	private readonly disableButtonsDebounced;

	constructor(
		private readonly editor: ICodeEditor,
		private readonly withBorder: boolean,
		private readonly _position: IObservable<Position | null>,
		private readonly _currentSuggestionIdx: IObservable<number>,
		private readonly _suggestionCount: IObservable<number | undefined>,
		private readonly _extraCommands: IObservable<InlineCompletionCommand[]>,
		private readonly _warning: IObservable<InlineCompletionWarning | undefined>,
		private readonly _relayout: () => void,
		@ICommandService private readonly _commandService: ICommandService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IMenuService private readonly _menuService: IMenuService,
	) {
		super();
		this.id = `InlineSuggestionHintsContentWidget${InlineSuggestionHintsContentWidget.id++}`;
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
		this.inlineCompletionsActionsMenus = this._register(this._menuService.createMenu(
			MenuId.InlineCompletionsActions,
			this._contextKeyService
		));
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
			InlineSuggestionHintsContentWidget._dropDownVisible = e;
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
			} else {
				this.clearAvailableSuggestionCountLabelDebounced.schedule();
			}

			if (suggestionCount !== undefined && suggestionCount > 1) {
				this.disableButtonsDebounced.cancel();
				this.previousAction.enabled = this.nextAction.enabled = true;
			} else {
				this.disableButtonsDebounced.schedule();
			}
		}));

		this._register(autorun(reader => {
			/** @description extra commands */
			const extraCommands = this._extraCommands.read(reader);
			const extraActions = extraCommands.map<IAction>(c => ({
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

	getId(): string { return this.id; }

	getDomNode(): HTMLElement {
		return this.nodes.root;
	}

	getPosition(): IContentWidgetPosition | null {
		return {
			position: this._position.get(),
			preference: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW],
			positionAffinity: PositionAffinity.LeftOfInjectedText,
		};
	}
}

class ActionViewItemWithClassName extends ActionViewItem {
	private _className: string | undefined = undefined;

	setClass(className: string | undefined): void {
		this._className = className;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		if (this._className) {
			container.classList.add(this._className);
		}
	}

	protected override updateTooltip(): void {
		// NOOP, disable tooltip
	}
}

class StatusBarViewItem extends MenuEntryActionViewItem {
	protected override updateLabel() {
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

	protected override updateTooltip(): void {
		// NOOP, disable tooltip
	}
}

export class CustomizedMenuWorkbenchToolBar extends WorkbenchToolBar {
	private readonly menu;
	private additionalActions: IAction[];
	private prependedPrimaryActions: IAction[];
	private additionalPrimaryActions: IAction[];

	constructor(
		container: HTMLElement,
		private readonly menuId: MenuId,
		private readonly options2: IMenuWorkbenchToolBarOptions | undefined,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(container, { resetMenu: menuId, ...options2 }, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService);
		this.menu = this._store.add(this.menuService.createMenu(this.menuId, this.contextKeyService, { emitEventsForSubmenuChanges: true }));
		this.additionalActions = [];
		this.prependedPrimaryActions = [];
		this.additionalPrimaryActions = [];

		this._store.add(this.menu.onDidChange(() => this.updateToolbar()));
		this.updateToolbar();
	}

	private updateToolbar(): void {
		const { primary, secondary } = getActionBarActions(
			this.menu.getActions(this.options2?.menuOptions),
			this.options2?.toolbarOptions?.primaryGroup, this.options2?.toolbarOptions?.shouldInlineSubmenu, this.options2?.toolbarOptions?.useSeparatorsInPrimaryActions
		);

		secondary.push(...this.additionalActions);
		primary.unshift(...this.prependedPrimaryActions);
		primary.push(...this.additionalPrimaryActions);
		this.setActions(primary, secondary);
	}

	setPrependedPrimaryActions(actions: IAction[]): void {
		if (equals(this.prependedPrimaryActions, actions, (a, b) => a === b)) {
			return;
		}

		this.prependedPrimaryActions = actions;
		this.updateToolbar();
	}

	setAdditionalPrimaryActions(actions: IAction[]): void {
		if (equals(this.additionalPrimaryActions, actions, (a, b) => a === b)) {
			return;
		}

		this.additionalPrimaryActions = actions;
		this.updateToolbar();
	}

	setAdditionalSecondaryActions(actions: IAction[]): void {
		if (equals(this.additionalActions, actions, (a, b) => a === b)) {
			return;
		}

		this.additionalActions = actions;
		this.updateToolbar();
	}
}
