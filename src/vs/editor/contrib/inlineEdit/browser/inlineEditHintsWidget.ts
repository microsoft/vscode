/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from 'vs/base/browser/dom';
import { KeybindingLabel, unthemedKeybindingLabelOptions } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { IAction, Separator } from 'vs/base/common/actions';
import { equals } from 'vs/base/common/arrays';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, autorun, autorunWithStore, derived, observableFromEvent } from 'vs/base/common/observable';
import { OS } from 'vs/base/common/platform';
import 'vs/css!./inlineEditHintsWidget';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { PositionAffinity } from 'vs/editor/common/model';
import { GhostTextWidget } from 'vs/editor/contrib/inlineEdit/browser/ghostTextWidget';
import { MenuEntryActionViewItem, createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuWorkbenchToolBarOptions, WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class InlineEditHintsWidget extends Disposable {
	private readonly alwaysShowToolbar = observableFromEvent(this, this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineEdit).showToolbar === 'always');

	private sessionPosition: Position | undefined = undefined;

	private readonly position = derived(this, reader => {
		const ghostText = this.model.read(reader)?.model.ghostText.read(reader);

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
		private readonly model: IObservable<GhostTextWidget | undefined>,
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
				InlineEditHintsContentWidget,
				this.editor,
				true,
				this.position,
			));
			editor.addContentWidget(contentWidget);
			store.add(toDisposable(() => editor.removeContentWidget(contentWidget)));
		}));
	}
}

export class InlineEditHintsContentWidget extends Disposable implements IContentWidget {
	private static _dropDownVisible = false;
	public static get dropDownVisible() { return this._dropDownVisible; }

	private static id = 0;

	private readonly id = `InlineEditHintsContentWidget${InlineEditHintsContentWidget.id++}`;
	public readonly allowEditorOverflow = true;
	public readonly suppressMouseDown = false;

	private readonly nodes = h('div.inlineEditHints', { className: this.withBorder ? '.withBorder' : '' }, [
		h('div@toolBar'),
	]);

	private readonly toolBar: CustomizedMenuWorkbenchToolBar;

	private readonly inlineCompletionsActionsMenus = this._register(this._menuService.createMenu(
		MenuId.InlineEditActions,
		this._contextKeyService
	));

	constructor(
		private readonly editor: ICodeEditor,
		private readonly withBorder: boolean,
		private readonly _position: IObservable<Position | null>,

		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IMenuService private readonly _menuService: IMenuService,
	) {
		super();

		this.toolBar = this._register(instantiationService.createInstance(CustomizedMenuWorkbenchToolBar, this.nodes.toolBar, this.editor, MenuId.InlineEditToolbar, {
			menuOptions: { renderShortTitle: true },
			toolbarOptions: { primaryGroup: g => g.startsWith('primary') },
			actionViewItemProvider: (action, options) => {
				if (action instanceof MenuItemAction) {
					return instantiationService.createInstance(StatusBarViewItem, action, undefined);
				}
				return undefined;
			},
			telemetrySource: 'InlineEditToolbar',
		}));

		this._register(this.toolBar.onDidChangeDropdownVisibility(e => {
			InlineEditHintsContentWidget._dropDownVisible = e;
		}));

		this._register(autorun(reader => {
			/** @description update position */
			this._position.read(reader);
			this.editor.layoutContentWidget(this);
		}));

		this._register(autorun(reader => {
			/** @description actions menu */

			const extraActions = [];

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

			const k = this._register(new KeybindingLabel(div, OS, { disableTitle: true, ...unthemedKeybindingLabelOptions }));
			k.set(kb);
			this.label.textContent = this._action.label;
			this.label.appendChild(div);
			this.label.classList.add('inlineEditStatusBarItemLabel');
		}
	}

	protected override updateTooltip(): void {
		// NOOP, disable tooltip
	}
}

export class CustomizedMenuWorkbenchToolBar extends WorkbenchToolBar {
	private readonly menu = this._store.add(this.menuService.createMenu(this.menuId, this.contextKeyService, { emitEventsForSubmenuChanges: true }));
	private additionalActions: IAction[] = [];
	private prependedPrimaryActions: IAction[] = [];

	constructor(
		container: HTMLElement,
		private readonly editor: ICodeEditor,
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

		this._store.add(this.menu.onDidChange(() => this.updateToolbar()));
		this._store.add(this.editor.onDidChangeCursorPosition(() => this.updateToolbar()));
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
		primary.unshift(...this.prependedPrimaryActions);
		this.setActions(primary, secondary);
	}

	setPrependedPrimaryActions(actions: IAction[]): void {
		if (equals(this.prependedPrimaryActions, actions, (a, b) => a === b)) {
			return;
		}

		this.prependedPrimaryActions = actions;
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
