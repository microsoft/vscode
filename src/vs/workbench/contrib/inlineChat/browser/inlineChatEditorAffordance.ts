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
import { ACTION_START, ACTION_ASK_IN_CHAT } from '../common/inlineChat.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

class QuickFixActionViewItem extends MenuEntryActionViewItem {

	readonly #lightBulbStore = this._store.add(new MutableDisposable<DisposableStore>());
	#currentTitle: string | undefined;
	readonly #editor: ICodeEditor;

	constructor(
		action: MenuItemAction,
		editor: ICodeEditor,
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
				const controller = CodeActionController.get(editor);
				const info = controller?.lightBulbState.get();
				const element = this.elementGetter();
				if (controller && info && element) {
					const { bottom, left } = element.getBoundingClientRect();
					await controller.showCodeActions(info.trigger, info.actions, { x: left, y: bottom });
				}
			}
		};

		super(wrappedAction, { draggable: false }, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);

		this.#editor = editor;
		wrappedAction.elementGetter = () => this.element;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.#updateFromLightBulb();
	}

	protected override getTooltip(): string {
		return this.#currentTitle ?? super.getTooltip();
	}

	#updateFromLightBulb(): void {
		const controller = CodeActionController.get(this.#editor);
		if (!controller) {
			return;
		}

		const store = new DisposableStore();
		this.#lightBulbStore.value = store;

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
			this.#currentTitle = info?.title;
			this.updateTooltip();
		}));
	}
}

class LabelWithKeybindingActionViewItem extends MenuEntryActionViewItem {

	readonly #kbLabel: string | undefined;

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
		this.#kbLabel = keybindingService.lookupKeybinding(action.id)?.getLabel() ?? undefined;
	}

	protected override updateLabel(): void {
		if (this.label) {
			dom.reset(this.label,
				this.action.label,
				...(this.#kbLabel ? [dom.$('span.inline-chat-keybinding', undefined, this.#kbLabel)] : [])
			);
		}
	}
}

/**
 * Content widget that shows a small sparkle icon at the cursor position.
 * When clicked, it shows the overlay widget for inline chat.
 */
export class InlineChatEditorAffordance extends Disposable implements IContentWidget {

	static #idPool = 0;

	readonly #id = `inline-chat-content-widget-${InlineChatEditorAffordance.#idPool++}`;
	readonly #domNode: HTMLElement;
	#position: IContentWidgetPosition | null = null;
	#isVisible = false;

	readonly #onDidRunAction = this._store.add(new Emitter<string>());
	readonly onDidRunAction: Event<string> = this.#onDidRunAction.event;

	readonly allowEditorOverflow = true;
	readonly suppressMouseDown = false;

	readonly #editor: ICodeEditor;

	constructor(
		editor: ICodeEditor,
		selection: IObservable<Selection | undefined>,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.#editor = editor;

		// Create the widget DOM
		this.#domNode = dom.$('.inline-chat-content-widget');

		// Create toolbar with the inline chat start action
		const toolbar = this._store.add(instantiationService.createInstance(MenuWorkbenchToolBar, this.#domNode, MenuId.InlineChatEditorAffordance, {
			telemetrySource: 'inlineChatEditorAffordance',
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			menuOptions: { renderShortTitle: true },
			toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
			actionViewItemProvider: (action: IAction) => {
				if (action instanceof MenuItemAction && action.id === quickFixCommandId) {
					return instantiationService.createInstance(QuickFixActionViewItem, action, this.#editor);
				}
				if (action instanceof MenuItemAction && (action.id === ACTION_START || action.id === ACTION_ASK_IN_CHAT || action.id === 'inlineChat.fixDiagnostics')) {
					return instantiationService.createInstance(LabelWithKeybindingActionViewItem, action);
				}
				return undefined;
			}
		}));
		this._store.add(toolbar.actionRunner.onDidRun((e) => {
			this.#onDidRunAction.fire(e.action.id);
			this.#hide();
		}));

		this._store.add(autorun(r => {
			const sel = selection.read(r);
			if (sel) {
				this.#show(sel);
			} else {
				this.#hide();
			}
		}));

		this._store.add(this.#editor.onDidScrollChange(() => {
			const sel = selection.get();
			if (!sel) {
				return;
			}
			const isInViewport = this.#isPositionInViewport();
			if (isInViewport && !this.#isVisible) {
				this.#show(sel);
			} else if (!isInViewport && this.#isVisible) {
				this.#hide();
			}
		}));
	}

	#show(selection: Selection): void {

		if (selection.isEmpty()) {
			this.#showAtLineStart(selection.getPosition().lineNumber);
		} else {
			this.#showAtSelection(selection);
		}

		if (this.#isVisible) {
			this.#editor.layoutContentWidget(this);
		} else {
			this.#editor.addContentWidget(this);
			this.#isVisible = true;
		}
	}

	#showAtSelection(selection: Selection): void {
		const cursorPosition = selection.getPosition();
		const direction = selection.getDirection();

		const preference = direction === SelectionDirection.RTL
			? ContentWidgetPositionPreference.ABOVE
			: ContentWidgetPositionPreference.BELOW;

		this.#position = {
			position: cursorPosition,
			preference: [preference],
		};
	}

	#showAtLineStart(lineNumber: number): void {
		const model = this.#editor.getModel();
		if (!model) {
			return;
		}

		const tabSize = model.getOptions().tabSize;
		const fontInfo = this.#editor.getOptions().get(EditorOption.fontInfo);
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

		this.#position = {
			position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
			preference: [ContentWidgetPositionPreference.EXACT],
		};
	}

	#isPositionInViewport(): boolean {
		const widgetPosition = this.#position?.position;
		if (!widgetPosition) {
			return false;
		}

		// Check vertical visibility
		const visibleRanges = this.#editor.getVisibleRanges();
		const isLineVisible = visibleRanges.some(range =>
			widgetPosition.lineNumber >= range.startLineNumber && widgetPosition.lineNumber <= range.endLineNumber
		);
		if (!isLineVisible) {
			return false;
		}

		// Check horizontal visibility
		const scrolledPos = this.#editor.getScrolledVisiblePosition(widgetPosition);
		if (!scrolledPos) {
			return false;
		}
		const layoutInfo = this.#editor.getOptions().get(EditorOption.layoutInfo);
		return scrolledPos.left >= 0 && scrolledPos.left <= layoutInfo.width;
	}

	#hide(): void {
		if (this.#isVisible) {
			this.#isVisible = false;
			this.#editor.removeContentWidget(this);
		}
	}

	getId(): string {
		return this.#id;
	}

	getDomNode(): HTMLElement {
		return this.#domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return this.#position;
	}

	beforeRender(): IDimension | null {
		const position = this.#editor.getPosition();
		const lineHeight = position ? this.#editor.getLineHeightForPosition(position) : this.#editor.getOption(EditorOption.lineHeight);

		this.#domNode.style.setProperty('--vscode-inline-chat-affordance-height', `${lineHeight}px`);

		return null;
	}

	override dispose(): void {
		if (this.#isVisible) {
			this.#editor.removeContentWidget(this);
		}
		super.dispose();
	}
}
