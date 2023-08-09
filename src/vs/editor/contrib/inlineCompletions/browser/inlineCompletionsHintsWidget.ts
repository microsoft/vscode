/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { KeybindingLabel, unthemedKeybindingLabelOptions } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { Action, IAction, Separator } from 'vs/base/common/actions';
import { equals } from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, autorun, autorunWithStore, derived, observableFromEvent } from 'vs/base/common/observable';
import { OS } from 'vs/base/common/platform';
import { ThemeIcon } from 'vs/base/common/themables';
import 'vs/css!./inlineCompletionsHintsWidget';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Command, InlineCompletionTriggerKind } from 'vs/editor/common/languages';
import { PositionAffinity } from 'vs/editor/common/model';
import { showNextInlineSuggestionActionId, showPreviousInlineSuggestionActionId } from 'vs/editor/contrib/inlineCompletions/browser/commandIds';
import { InlineCompletionsModel } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsModel';
import { localize } from 'vs/nls';
import { MenuEntryActionViewItem, createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuWorkbenchToolBarOptions, WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';

export class InlineCompletionsHintsWidget extends Disposable {
	private readonly alwaysShowToolbar = observableFromEvent(this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineSuggest).showToolbar === 'always');

	private sessionPosition: Position | undefined = undefined;

	private readonly position = derived(reader => {
		/** @description position */
		const ghostText = this.model.read(reader)?.ghostText.read(reader);

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

	constructor(
		private readonly editor: ICodeEditor,
		private readonly model: IObservable<InlineCompletionsModel | undefined>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(autorunWithStore((reader, store) => {
			/** @description setup content widget */
			const model = this.model.read(reader);
			if (!model || !this.alwaysShowToolbar.read(reader)) {
				return;
			}

			const contentWidget = store.add(this.instantiationService.createInstance(
				InlineSuggestionHintsContentWidget,
				this.editor,
				true,
				this.position,
				model.selectedInlineCompletionIndex,
				model.inlineCompletionsCount,
				model.selectedInlineCompletion.map(v => v?.inlineCompletion.source.inlineCompletions.commands ?? []),
			));
			editor.addContentWidget(contentWidget);
			store.add(toDisposable(() => editor.removeContentWidget(contentWidget)));

			store.add(autorun(reader => {
				/** @description request explicit */
				const position = this.position.read(reader);
				if (!position) {
					return;
				}
				if (model.lastTriggerKind.read(reader) !== InlineCompletionTriggerKind.Explicit) {
					model.triggerExplicitly();
				}
			}));
		}));
	}
}

const inlineSuggestionHintsNextIcon = registerIcon('inline-suggestion-hints-next', Codicon.chevronRight, localize('parameterHintsNextIcon', 'Icon for show next parameter hint.'));
const inlineSuggestionHintsPreviousIcon = registerIcon('inline-suggestion-hints-previous', Codicon.chevronLeft, localize('parameterHintsPreviousIcon', 'Icon for show previous parameter hint.'));

export class InlineSuggestionHintsContentWidget extends Disposable implements IContentWidget {
	private static _dropDownVisible = false;
	public static get dropDownVisible() { return this._dropDownVisible; }

	private static id = 0;

	private readonly id = `InlineSuggestionHintsContentWidget${InlineSuggestionHintsContentWidget.id++}`;
	public readonly allowEditorOverflow = true;
	public readonly suppressMouseDown = false;

	private readonly nodes = h('div.inlineSuggestionsHints', { className: this.withBorder ? '.withBorder' : '' }, [
		h('div', { style: { display: 'flex' } }, [
			h('div@actionBar', { className: 'custom-actions' }),
			h('div@toolBar'),
		])
	]);

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

	private readonly previousAction = this.createCommandAction(showPreviousInlineSuggestionActionId, localize('previous', 'Previous'), ThemeIcon.asClassName(inlineSuggestionHintsPreviousIcon));
	private readonly availableSuggestionCountAction = new Action('inlineSuggestionHints.availableSuggestionCount', '', undefined, false);
	private readonly nextAction = this.createCommandAction(showNextInlineSuggestionActionId, localize('next', 'Next'), ThemeIcon.asClassName(inlineSuggestionHintsNextIcon));

	private readonly toolBar: CustomizedMenuWorkbenchToolBar;

	// TODO@hediet: deprecate MenuId.InlineCompletionsActions
	private readonly inlineCompletionsActionsMenus = this._register(this._menuService.createMenu(
		MenuId.InlineCompletionsActions,
		this._contextKeyService
	));

	private readonly clearAvailableSuggestionCountLabelDebounced = this._register(new RunOnceScheduler(() => {
		this.availableSuggestionCountAction.label = '';
	}, 100));

	private readonly disableButtonsDebounced = this._register(new RunOnceScheduler(() => {
		this.previousAction.enabled = this.nextAction.enabled = false;
	}, 100));

	private lastCommands: Command[] = [];

	constructor(
		private readonly editor: ICodeEditor,
		private readonly withBorder: boolean,
		private readonly _position: IObservable<Position | null>,
		private readonly _currentSuggestionIdx: IObservable<number>,
		private readonly _suggestionCount: IObservable<number | undefined>,
		private readonly _extraCommands: IObservable<Command[]>,

		@ICommandService private readonly _commandService: ICommandService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IMenuService private readonly _menuService: IMenuService,
	) {
		super();

		const actionBar = this._register(new ActionBar(this.nodes.actionBar));

		actionBar.push(this.previousAction, { icon: true, label: false });
		actionBar.push(this.availableSuggestionCountAction);
		actionBar.push(this.nextAction, { icon: true, label: false });

		this.toolBar = this._register(instantiationService.createInstance(CustomizedMenuWorkbenchToolBar, this.nodes.toolBar, MenuId.InlineSuggestionToolbar, {
			menuOptions: { renderShortTitle: true },
			toolbarOptions: { primaryGroup: g => g.startsWith('primary') },
			actionViewItemProvider: (action, options) => {
				return action instanceof MenuItemAction ? instantiationService.createInstance(StatusBarViewItem, action, undefined) : undefined;
			},
			telemetrySource: 'InlineSuggestionToolbar',
		}));

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
			if (equals(this.lastCommands, extraCommands)) {
				// nothing to update
				return;
			}

			this.lastCommands = extraCommands;

			const extraActions = extraCommands.map<IAction>(c => ({
				class: undefined,
				id: c.id,
				enabled: true,
				tooltip: c.tooltip || '',
				label: c.title,
				run: (event) => {
					return this._commandService.executeCommand(c.id);
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

class StatusBarViewItem extends MenuEntryActionViewItem {
	protected override updateLabel() {
		const kb = this._keybindingService.lookupKeybinding(this._action.id, this._contextKeyService);
		if (!kb) {
			return super.updateLabel();
		}
		if (this.label) {
			const div = h('div.keybinding').root;

			const k = new KeybindingLabel(div, OS, { disableTitle: true, ...unthemedKeybindingLabelOptions });
			k.set(kb);
			this.label.textContent = this._action.label;
			this.label.appendChild(div);
			this.label.classList.add('inlineSuggestionStatusBarItemLabel');
		}
	}
}

export class CustomizedMenuWorkbenchToolBar extends WorkbenchToolBar {
	private readonly menu = this._store.add(this.menuService.createMenu(this.menuId, this.contextKeyService, { emitEventsForSubmenuChanges: true }));
	private additionalActions: IAction[] = [];

	constructor(
		container: HTMLElement,
		private readonly menuId: MenuId,
		private readonly options2: IMenuWorkbenchToolBarOptions | undefined,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(container, { resetMenu: menuId, ...options2 }, menuService, contextKeyService, contextMenuService, keybindingService, telemetryService);

		this._store.add(this.menu.onDidChange(() => this.updateToolbar()));
		this.updateToolbar();
	}

	private updateToolbar(): void {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		createAndFillInActionBarActions(
			this.menu,
			this.options2?.menuOptions,
			{ primary, secondary },
			this.options2?.toolbarOptions?.primaryGroup, this.options2?.toolbarOptions?.shouldInlineSubmenu, this.options2?.toolbarOptions?.useSeparatorsInPrimaryActions
		);

		secondary.push(...this.additionalActions);
		this.setActions(primary, secondary);
	}

	setAdditionalSecondaryActions(actions: IAction[]): void {
		if (equals(this.additionalActions, actions, (a, b) => a === b)) {
			// don't update if the actions are the same
			return;
		}

		this.additionalActions = actions;
		this.updateToolbar();
	}
}
