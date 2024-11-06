/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatEditorOverlay.css';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../../editor/browser/editorBrowser.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatEditingSessionState, IChatEditingService, IModifiedFileEntry, WorkingSetEntryState } from '../common/chatEditingService.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';

class ChatEditorOverlayWidget implements IOverlayWidget {

	readonly allowEditorOverflow = false;

	private readonly _domNode: HTMLElement;
	private readonly _toolbar: WorkbenchToolBar;

	private _isAdded: boolean = false;
	private readonly _showStore = new DisposableStore();

	private readonly _entry = observableValue<IModifiedFileEntry | undefined>(this, undefined);

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService instaService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		this._domNode = document.createElement('div');
		this._domNode.classList.add('chat-editor-overlay-widget');

		this._toolbar = instaService.createInstance(MenuWorkbenchToolBar, this._domNode, MenuId.ChatEditingEditorContent, {
			telemetrySource: 'chatEditor.overlayToolbar',
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true
			},
			menuOptions: { renderShortTitle: true },
			actionViewItemProvider: (action, options) => {
				if (action.id === 'workbench.action.chat.openEditSession') {

					const that = this;

					return new class extends ActionViewItem {
						constructor() {
							super(undefined, action, { ...options });
							this._store.add(autorun(r => {
								const entry = that._entry.read(r);
								entry?.isCurrentlyBeingModified.read(r);
								this.updateClass();
							}));
						}
						protected override getClass(): string | undefined {
							const entry = that._entry.get();
							const busy = entry?.isCurrentlyBeingModified.get();
							return busy
								? ThemeIcon.asClassName(ThemeIcon.modify(Codicon.loading, 'spin'))
								: action.class;
						}
					};
				}
				if (action.id === 'chatEditor.action.accept' || action.id === 'chatEditor.action.reject') {
					return new ActionViewItem(undefined, action, { ...options, icon: false, label: true, keybindingNotRenderedWithLabel: true });
				}
				return undefined;
			}
		});
	}

	dispose() {
		this.hide();
		this._showStore.dispose();
		this._toolbar.dispose();
	}

	getId(): string {
		return 'chatEditorOverlayWidget';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return { preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER };
	}

	show(entry: IModifiedFileEntry) {

		this._entry.set(entry, undefined);

		if (!this._isAdded) {
			this._editor.addOverlayWidget(this);
			this._isAdded = true;
		}
	}

	hide() {

		this._entry.set(undefined, undefined);

		if (this._isAdded) {
			this._editor.removeOverlayWidget(this);
			this._isAdded = false;
			this._showStore.clear();
		}
	}
}

export class ChatEditorOverlayController implements IEditorContribution {

	static readonly ID = 'editor.contrib.chatOverlayController';

	private readonly _store = new DisposableStore();

	static get(editor: ICodeEditor) {
		return editor.getContribution<ChatEditorOverlayController>(ChatEditorOverlayController.ID);
	}

	constructor(
		private readonly _editor: ICodeEditor,
		@IChatEditingService chatEditingService: IChatEditingService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		const modelObs = observableFromEvent(this._editor.onDidChangeModel, () => this._editor.getModel());
		const widget = instaService.createInstance(ChatEditorOverlayWidget, this._editor);

		this._store.add(autorun(r => {
			const model = modelObs.read(r);
			const session = chatEditingService.currentEditingSessionObs.read(r);
			if (!session || !model) {
				widget.hide();
				return;
			}

			const state = session.state.read(r);
			if (state === ChatEditingSessionState.Disposed) {
				widget.hide();
				return;
			}

			const entries = session.entries.read(r);
			const idx = entries.findIndex(e => isEqual(e.modifiedURI, model.uri));
			if (idx < 0) {
				widget.hide();
				return;
			}

			const isModifyingOrModified = entries.some(e => e.state.read(r) === WorkingSetEntryState.Modified || e.isCurrentlyBeingModified.read(r));
			if (!isModifyingOrModified) {
				widget.hide();
				return;
			}

			const entry = entries[idx];
			widget.show(entry);

		}));
	}

	dispose() {
		this._store.dispose();
	}
}
