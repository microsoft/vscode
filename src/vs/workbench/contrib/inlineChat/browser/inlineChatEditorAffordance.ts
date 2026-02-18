/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inlineChatEditorAffordance.css';
import { IDimension } from '../../../../base/browser/dom.js';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { Selection, SelectionDirection } from '../../../../editor/common/core/selection.js';
import { computeIndentLevel } from '../../../../editor/common/model/utils.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { quickFixCommandId } from '../../../../editor/contrib/codeAction/browser/codeAction.js';
import { CodeActionController } from '../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { IAction } from '../../../../base/common/actions.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ACTION_START } from '../common/inlineChat.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

class QuickFixActionViewItem extends MenuEntryActionViewItem {

	private readonly _lightBulbStore = this._store.add(new MutableDisposable<DisposableStore>());
	private _currentTitle: string | undefined;

	constructor(
		action: MenuItemAction,
		private readonly _editor: ICodeEditor,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ICommandService commandService: ICommandService
	) {
		const wrappedAction = new class extends MenuItemAction {
			constructor() {
				super(action.item, action.alt?.item, {}, action.hideActions, action.menuKeybinding, contextKeyService, commandService);
			}

			elementGetter: () => HTMLElement | undefined = () => undefined;

			override async run(...args: unknown[]): Promise<void> {
				const controller = CodeActionController.get(_editor);
				const info = controller?.lightBulbState.get();
				const element = this.elementGetter();
				if (controller && info && element) {
					const { bottom, left } = element.getBoundingClientRect();
					await controller.showCodeActions(info.trigger, info.actions, { x: left, y: bottom });
				}
			}
		};

		super(wrappedAction, { draggable: false }, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);

		wrappedAction.elementGetter = () => this.element;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this._updateFromLightBulb();
	}

	protected override getTooltip(): string {
		return this._currentTitle ?? super.getTooltip();
	}

	private _updateFromLightBulb(): void {
		const controller = CodeActionController.get(this._editor);
		if (!controller) {
			return;
		}

		const store = new DisposableStore();
		this._lightBulbStore.value = store;

		store.add(autorun(reader => {
			const info = controller.lightBulbState.read(reader);
			if (this.label) {
				// Update icon
				const icon = info?.icon ?? Codicon.lightBulb;
				const iconClasses = ThemeIcon.asClassNameArray(icon);
				this.label.className = '';
				this.label.classList.add('codicon', 'action-label', ...iconClasses);
			}

			// Update tooltip
			this._currentTitle = info?.title;
			this.updateTooltip();
		}));
	}
}

class InlineChatStartActionViewItem extends MenuEntryActionViewItem {

	private readonly _kbLabel: string | undefined;

	constructor(
		action: MenuItemAction,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService accessibilityService: IAccessibilityService
	) {
		super(action, { draggable: false }, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
		this.options.label = true;
		this.options.icon = false;
		this._kbLabel = keybindingService.lookupKeybinding(action.id)?.getLabel() ?? undefined;
	}

	protected override updateLabel(): void {
		if (this.label) {
			dom.reset(this.label,
				this.action.label,
				...(this._kbLabel ? [dom.$('span.inline-chat-keybinding', undefined, this._kbLabel)] : [])
			);
		}
	}
}

/**
 * Content widget that shows a small sparkle icon at the cursor position.
 * When clicked, it shows the overlay widget for inline chat.
 */
export class InlineChatEditorAffordance extends Disposable implements IContentWidget {

	private static _idPool = 0;

	private readonly _id = `inline-chat-content-widget-${InlineChatEditorAffordance._idPool++}`;
	private readonly _domNode: HTMLElement;
	private _position: IContentWidgetPosition | null = null;
	private _isVisible = false;

	private readonly _onDidRunAction = this._store.add(new Emitter<string>());
	readonly onDidRunAction: Event<string> = this._onDidRunAction.event;

	readonly allowEditorOverflow = false;
	readonly suppressMouseDown = false;

	constructor(
		private readonly _editor: ICodeEditor,
		selection: IObservable<Selection | undefined>,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		// Create the widget DOM
		this._domNode = dom.$('.inline-chat-content-widget');

		// Create toolbar with the inline chat start action
		const toolbar = this._store.add(instantiationService.createInstance(MenuWorkbenchToolBar, this._domNode, MenuId.InlineChatEditorAffordance, {
			telemetrySource: 'inlineChatEditorAffordance',
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			menuOptions: { renderShortTitle: true },
			toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
			actionViewItemProvider: (action: IAction) => {
				if (action instanceof MenuItemAction && action.id === quickFixCommandId) {
					return instantiationService.createInstance(QuickFixActionViewItem, action, this._editor);
				}
				if (action instanceof MenuItemAction && action.id === ACTION_START) {
					return instantiationService.createInstance(InlineChatStartActionViewItem, action);
				}
				return undefined;
			}
		}));
		this._store.add(toolbar.actionRunner.onDidRun((e) => {
			this._onDidRunAction.fire(e.action.id);
			this._hide();
		}));

		this._store.add(autorun(r => {
			const sel = selection.read(r);
			if (sel) {
				this._show(sel);
			} else {
				this._hide();
			}
		}));
	}

	private _show(selection: Selection): void {

		if (selection.isEmpty()) {
			this._showAtLineStart(selection.getPosition().lineNumber);
		} else {
			this._showAtSelection(selection);
		}

		if (this._isVisible) {
			this._editor.layoutContentWidget(this);
		} else {
			this._editor.addContentWidget(this);
			this._isVisible = true;
		}
	}

	private _showAtSelection(selection: Selection): void {
		const cursorPosition = selection.getPosition();
		const direction = selection.getDirection();

		const preference = direction === SelectionDirection.RTL
			? ContentWidgetPositionPreference.ABOVE
			: ContentWidgetPositionPreference.BELOW;

		this._position = {
			position: cursorPosition,
			preference: [preference],
		};
	}

	private _showAtLineStart(lineNumber: number): void {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const tabSize = model.getOptions().tabSize;
		const fontInfo = this._editor.getOptions().get(EditorOption.fontInfo);
		const lineContent = model.getLineContent(lineNumber);
		const indent = computeIndentLevel(lineContent, tabSize);
		const lineHasSpace = indent < 0 ? true : fontInfo.spaceWidth * indent > 22;

		let effectiveLineNumber = lineNumber;

		if (!lineHasSpace) {
			const isLineEmptyOrIndented = (ln: number): boolean => {
				const content = model.getLineContent(ln);
				return /^\s*$|^\s+/.test(content);
			};

			const lineCount = model.getLineCount();
			if (lineNumber > 1 && isLineEmptyOrIndented(lineNumber - 1)) {
				effectiveLineNumber = lineNumber - 1;
			} else if (lineNumber < lineCount && isLineEmptyOrIndented(lineNumber + 1)) {
				effectiveLineNumber = lineNumber + 1;
			}
		}

		const effectiveColumnNumber = /^\S\s*$/.test(model.getLineContent(effectiveLineNumber)) ? 2 : 1;

		this._position = {
			position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
			preference: [ContentWidgetPositionPreference.EXACT],
		};
	}

	private _hide(): void {
		if (this._isVisible) {
			this._isVisible = false;
			this._editor.removeContentWidget(this);
		}
	}

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return this._position;
	}

	beforeRender(): IDimension | null {
		const position = this._editor.getPosition();
		const lineHeight = position ? this._editor.getLineHeightForPosition(position) : this._editor.getOption(EditorOption.lineHeight);

		this._domNode.style.setProperty('--vscode-inline-chat-affordance-height', `${lineHeight}px`);

		return null;
	}

	override dispose(): void {
		if (this._isVisible) {
			this._editor.removeContentWidget(this);
		}
		super.dispose();
	}
}
