/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
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

		const menu = this._register(menuService.createMenu(MenuId.EditorContent, editor.contextKeyService));
		const menuIsEmptyObs = observableFromEvent(this, menu.onDidChange, () => menu.getActions().length === 0);

		this._register(autorun(reader => {
			const menuIsEmpty = menuIsEmptyObs.read(reader);
			if (menuIsEmpty) {
				return;
			}

			const container = h('div.floating-menu-overlay-widget');

			// Set height explicitly to ensure that the floating menu element
			// is rendered in the lower right corner at the correct position.
			container.root.style.height = '28px';

			// Toolbar
			const toolbar = instantiationService.createInstance(MenuWorkbenchToolBar, container.root, MenuId.EditorContent, {
				actionViewItemProvider: (action, options) => {
					if (!(action instanceof MenuItemAction)) {
						return undefined;
					}

					const keybinding = keybindingService.lookupKeybinding(action.id);
					if (!keybinding) {
						return undefined;
					}

					return instantiationService.createInstance(class extends MenuEntryActionViewItem {
						protected override updateLabel(): void {
							if (this.options.label && this.label) {
								this.label.textContent = `${this._commandAction.label} (${keybinding.getLabel()})`;
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
				const model = editorObs.model.read(reader);
				toolbar.context = model?.uri;
			}));

			// Overlay widget
			reader.store.add(editorObs.createOverlayWidget({
				allowEditorOverflow: false,
				domNode: container.root,
				minContentWidthInPx: constObservable(0),
				position: constObservable({
					preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
				})
			}));
		}));
	}
}
