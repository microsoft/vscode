/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatEditorOverlay.css';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../../editor/browser/editorBrowser.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatEditingSessionState, IChatEditingService, IModifiedFileEntry, WorkingSetEntryState } from '../common/chatEditingService.js';
import { Separator, toAction } from '../../../../base/common/actions.js';
import { localize } from '../../../../nls.js';
import { ACTIVE_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ChatEditorController } from './chatEditorController.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { EDITS_VIEW_ID } from './chat.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';

class ChatEditorOverlayWidget implements IOverlayWidget {

	readonly allowEditorOverflow = false;

	private readonly _domNode: HTMLElement;
	private readonly _toolbar: WorkbenchToolBar;

	private _isAdded: boolean = false;
	private readonly _showStore = new DisposableStore();

	constructor(
		private readonly _editor: ICodeEditor,
		@IEditorService private readonly _editorService: IEditorService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		this._domNode = document.createElement('div');
		this._domNode.classList.add('chat-editor-overlay-widget');

		this._toolbar = instaService.createInstance(WorkbenchToolBar, this._domNode, {
			telemetrySource: 'chatEditor.overlayToolbar',
			actionViewItemProvider: (action, options) => {
				if (action.id === 'accept' || action.id === 'discard') {
					return new ActionViewItem(undefined, action, { ...options, label: true, icon: false });
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

	show(entry: IModifiedFileEntry, prevEntry: IModifiedFileEntry, nextEntry: IModifiedFileEntry) {

		this._showStore.clear();

		const ctrl = ChatEditorController.get(this._editor);
		if (!ctrl) {
			return;
		}

		const navigate = (next: boolean) => {
			const didRevealWithin = next ? ctrl.revealNext(true) : ctrl.revealPrevious(true);
			if (!didRevealWithin) {
				reveal(next ? nextEntry : prevEntry);
			}
		};

		const reveal = (entry: IModifiedFileEntry) => {

			const change = entry.diffInfo.get().changes.at(0);
			return this._editorService.openEditor({
				resource: entry.modifiedURI,
				options: {
					selection: change && Range.fromPositions({ lineNumber: change.original.startLineNumber, column: 1 }),
					revealIfOpened: false,
					revealIfVisible: false,
				}
			}, ACTIVE_GROUP);
		};

		this._showStore.add(autorun(r => {

			const busy = entry.isCurrentlyBeingModified.read(r);
			const modified = entry.state.read(r) === WorkingSetEntryState.Modified;

			this._domNode.classList.toggle('busy', busy);

			const groups = [[
				toAction({
					id: 'open',
					label: localize('open', 'Open Chat Edit'),
					class: ThemeIcon.asClassName(busy
						? ThemeIcon.modify(Codicon.loading, 'spin')
						: Codicon.goToEditingSession),
					run: async () => {
						await this._viewsService.openView(EDITS_VIEW_ID);
					}
				}),
				toAction({
					id: 'accept',
					label: localize('accept', 'Accept'),
					tooltip: localize('acceptTooltip', 'Accept Chat Edits'),
					class: ThemeIcon.asClassName(Codicon.check),
					enabled: !busy && modified,
					run: () => {
						entry.accept(undefined);
						reveal(nextEntry);
					}
				}),
				toAction({
					id: 'discard',
					label: localize('discard', 'Discard'),
					tooltip: localize('discardTooltip', 'Discard Chat Edits'),
					class: ThemeIcon.asClassName(Codicon.discard),
					enabled: !busy && modified,
					run: () => {
						entry.reject(undefined);
						reveal(nextEntry);
					}
				}),
			], [
				toAction({
					id: 'prev',
					label: localize('prev', 'Previous Entry'),
					class: ThemeIcon.asClassName(Codicon.arrowUp),
					enabled: entry !== prevEntry,
					run: () => navigate(false)
				}),
				toAction({
					id: 'next',
					label: localize('next', 'Next Entry'),
					class: ThemeIcon.asClassName(Codicon.arrowDown),
					enabled: entry !== nextEntry,
					run: () => navigate(true)
				})
			]];

			const actions = Separator.join(...groups);
			this._toolbar.setActions(actions);
		}));

		if (!this._isAdded) {
			this._editor.addOverlayWidget(this);
			this._isAdded = true;
		}
	}

	hide() {
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
			const prevEntry = entries[(idx - 1 + entries.length) % entries.length];
			const nextEntry = entries[(idx + 1) % entries.length];

			widget.show(entry, prevEntry, nextEntry);

		}));
	}

	dispose() {
		this._store.dispose();
	}
}
