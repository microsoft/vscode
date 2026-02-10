/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { getActionBarActions, MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { autorun, constObservable, derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ICodeEditor, OverlayWidgetPositionPreference } from '../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../browser/observableCodeEditor.js';
import { IEditorContribution } from '../../../common/editorCommon.js';

export class FloatingEditorToolbar extends Disposable implements IEditorContribution {
	static readonly ID = 'editor.contrib.floatingToolbar';

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IMenuService menuService: IMenuService
	) {
		super();

		const editorObs = this._register(observableCodeEditor(editor));
		const editorUriObs = derived(reader => editorObs.model.read(reader)?.uri);

		// Widget
		const widget = this._register(instantiationService.createInstance(
			FloatingEditorToolbarWidget,
			MenuId.EditorContent,
			editor.contextKeyService,
			editorUriObs));

		// Render widget
		this._register(autorun(reader => {
			const hasActions = widget.hasActions.read(reader);
			if (!hasActions) {
				return;
			}

			// Overlay widget
			reader.store.add(editorObs.createOverlayWidget({
				allowEditorOverflow: false,
				domNode: widget.element,
				minContentWidthInPx: constObservable(0),
				position: constObservable({
					preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
				})
			}));
		}));
	}
}

export class FloatingEditorToolbarWidget extends Disposable {
	readonly element: HTMLElement;
	readonly hasActions: IObservable<boolean>;

	constructor(
		_menuId: MenuId,
		_scopedContextKeyService: IContextKeyService,
		_toolbarContext: IObservable<URI | undefined>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IMenuService menuService: IMenuService
	) {
		super();

		const menu = this._register(menuService.createMenu(_menuId, _scopedContextKeyService));
		const menuGroupsObs = observableFromEvent(this, menu.onDidChange, () => menu.getActions());

		const menuPrimaryActionIdObs = derived(reader => {
			const menuGroups = menuGroupsObs.read(reader);

			const { primary } = getActionBarActions(menuGroups, () => true);
			return primary.length > 0 ? primary[0].id : undefined;
		});

		this.hasActions = derived(reader => menuGroupsObs.read(reader).length > 0);

		this.element = h('div.floating-menu-overlay-widget').root;
		this._register(toDisposable(() => this.element.remove()));

		// Set height explicitly to ensure that the floating menu element
		// is rendered in the lower right corner at the correct position.
		this.element.style.height = '26px';

		this._register(autorun(reader => {
			const hasActions = this.hasActions.read(reader);
			const menuPrimaryActionId = menuPrimaryActionIdObs.read(reader);

			if (!hasActions) {
				return;
			}

			// Toolbar
			const toolbar = instantiationService.createInstance(MenuWorkbenchToolBar, this.element, _menuId, {
				actionViewItemProvider: (action, options) => {
					if (!(action instanceof MenuItemAction)) {
						return undefined;
					}

					return instantiationService.createInstance(class extends MenuEntryActionViewItem {
						override render(container: HTMLElement): void {
							super.render(container);

							// Highlight primary action
							if (action.id === menuPrimaryActionId) {
								this.element?.classList.add('primary');
							}
						}

						protected override updateLabel(): void {
							const keybinding = keybindingService.lookupKeybinding(action.id);
							const keybindingLabel = keybinding ? keybinding.getLabel() : undefined;

							if (this.options.label && this.label) {
								this.label.textContent = keybindingLabel
									? `${this._commandAction.label} (${keybindingLabel})`
									: this._commandAction.label;
							}
						}
					}, action, { ...options, keybindingNotRenderedWithLabel: true });
				},
				hiddenItemStrategy: HiddenItemStrategy.Ignore,
				menuOptions: {
					shouldForwardArgs: true
				},
				telemetrySource: 'editor.overlayToolbar',
				toolbarOptions: {
					primaryGroup: () => true,
					useSeparatorsInPrimaryActions: true
				},
			});

			reader.store.add(toolbar);
			reader.store.add(autorun(reader => {
				const context = _toolbarContext.read(reader);
				toolbar.context = context;
			}));
		}));
	}
}
