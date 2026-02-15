/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inlineChatEditorAffordance.css';
import { IDimension } from '../../../../base/browser/dom.js';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { Selection, SelectionDirection } from '../../../../editor/common/core/selection.js';
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
		@IAccessibilityService accessibilityService: IAccessibilityService
	) {
		super(action, { draggable: false }, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
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
				this.label.classList.add('codicon', ...iconClasses);
			}

			// Update tooltip
			this._currentTitle = info?.title;
			this.updateTooltip();
		}));
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

	readonly allowEditorOverflow = true;
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
		this._store.add(instantiationService.createInstance(MenuWorkbenchToolBar, this._domNode, MenuId.InlineChatEditorAffordance, {
			telemetrySource: 'inlineChatEditorAffordance',
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			menuOptions: { renderShortTitle: true },
			toolbarOptions: { primaryGroup: () => true },
			actionViewItemProvider: (action: IAction) => {
				if (action instanceof MenuItemAction && action.id === quickFixCommandId) {
					return instantiationService.createInstance(QuickFixActionViewItem, action, this._editor);
				}
				return undefined;
			}
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

		// Position at the cursor (active end of selection)
		const cursorPosition = selection.getPosition();
		const direction = selection.getDirection();

		// Show above for RTL (selection going up), below for LTR (selection going down)
		const preference = direction === SelectionDirection.RTL
			? ContentWidgetPositionPreference.ABOVE
			: ContentWidgetPositionPreference.BELOW;

		this._position = {
			position: cursorPosition,
			preference: [preference],
		};

		if (this._isVisible) {
			this._editor.layoutContentWidget(this);
		} else {
			this._editor.addContentWidget(this);
			this._isVisible = true;
		}
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
