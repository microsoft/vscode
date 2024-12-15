/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatEditorOverlay.css';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../../editor/browser/editorBrowser.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatEditingSessionState, IChatEditingService, IChatEditingSession, IModifiedFileEntry, WorkingSetEntryState } from '../common/chatEditingService.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ACTIVE_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IActionRunner } from '../../../../base/common/actions.js';
import { $, append, EventLike, reset } from '../../../../base/browser/dom.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { assertType } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { AcceptAction, RejectAction } from './chatEditorActions.js';
import { ChatEditorController } from './chatEditorController.js';

class ChatEditorOverlayWidget implements IOverlayWidget {

	readonly allowEditorOverflow = false;

	private readonly _domNode: HTMLElement;
	private readonly _progressNode: HTMLElement;
	private readonly _toolbar: WorkbenchToolBar;

	private _isAdded: boolean = false;
	private readonly _showStore = new DisposableStore();

	private readonly _entry = observableValue<{ entry: IModifiedFileEntry; next: IModifiedFileEntry } | undefined>(this, undefined);

	private readonly _navigationBearings = observableValue<{ changeCount: number; activeIdx: number; entriesCount: number }>(this, { changeCount: -1, activeIdx: -1, entriesCount: -1 });

	constructor(
		private readonly _editor: ICodeEditor,
		@IEditorService editorService: IEditorService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		this._domNode = document.createElement('div');
		this._domNode.classList.add('chat-editor-overlay-widget');

		const progressNode = document.createElement('div');
		progressNode.classList.add('chat-editor-overlay-progress');
		append(progressNode, renderIcon(ThemeIcon.modify(Codicon.loading, 'spin')));
		this._progressNode = append(progressNode, $('SPAN.busy-label'));
		this._domNode.appendChild(progressNode);

		const toolbarNode = document.createElement('div');
		toolbarNode.classList.add('chat-editor-overlay-toolbar');
		this._domNode.appendChild(toolbarNode);

		this._toolbar = instaService.createInstance(MenuWorkbenchToolBar, toolbarNode, MenuId.ChatEditingEditorContent, {
			telemetrySource: 'chatEditor.overlayToolbar',
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true
			},
			menuOptions: { renderShortTitle: true },
			actionViewItemProvider: (action, options) => {
				const that = this;

				if (action.id === navigationBearingFakeActionId) {
					return new class extends ActionViewItem {

						constructor() {
							super(undefined, action, { ...options, icon: false, label: true, keybindingNotRenderedWithLabel: true });
						}

						override render(container: HTMLElement) {
							super.render(container);

							container.classList.add('label-item');

							this._store.add(autorun(r => {
								assertType(this.label);

								const { changeCount, activeIdx } = that._navigationBearings.read(r);
								const n = activeIdx === -1 ? '?' : `${activeIdx + 1}`;
								const m = changeCount === -1 ? '?' : `${changeCount}`;
								this.label.innerText = localize('nOfM', "{0} of {1}", n, m);

								this.updateTooltip();
							}));
						}

						protected override getTooltip(): string | undefined {
							const { changeCount, entriesCount } = that._navigationBearings.get();
							if (changeCount === -1 || entriesCount === -1) {
								return undefined;
							} else if (changeCount === 1 && entriesCount === 1) {
								return localize('tooltip_11', "1 change in 1 file");
							} else if (changeCount === 1) {
								return localize('tooltip_1n', "1 change in {0} files", entriesCount);
							} else if (entriesCount === 1) {
								return localize('tooltip_n1', "{0} changes in 1 file", changeCount);
							} else {
								return localize('tooltip_nm', "{0} changes in {1} files", changeCount, entriesCount);
							}
						}

						override onClick(event: EventLike, preserveFocus?: boolean): void {
							ChatEditorController.get(that._editor)?.unlockScroll();
						}
					};
				}

				if (action.id === AcceptAction.ID || action.id === RejectAction.ID) {
					return new class extends ActionViewItem {

						private readonly _reveal = this._store.add(new MutableDisposable());

						constructor() {
							super(undefined, action, { ...options, icon: false, label: true, keybindingNotRenderedWithLabel: true });
						}
						override set actionRunner(actionRunner: IActionRunner) {
							super.actionRunner = actionRunner;

							const store = new DisposableStore();

							store.add(actionRunner.onWillRun(_e => {
								that._editor.focus();
							}));

							store.add(actionRunner.onDidRun(e => {
								if (e.action !== this.action) {
									return;
								}
								const d = that._entry.get();
								if (!d || d.entry === d.next) {
									return;
								}
								const change = d.next.diffInfo.get().changes.at(0);
								return editorService.openEditor({
									resource: d.next.modifiedURI,
									options: {
										selection: change && Range.fromPositions({ lineNumber: change.original.startLineNumber, column: 1 }),
										revealIfOpened: false,
										revealIfVisible: false,
									}
								}, ACTIVE_GROUP);
							}));

							this._reveal.value = store;
						}
						override get actionRunner(): IActionRunner {
							return super.actionRunner;
						}
					};
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

	show(session: IChatEditingSession, activeEntry: IModifiedFileEntry, next: IModifiedFileEntry) {

		this._showStore.clear();

		this._entry.set({ entry: activeEntry, next }, undefined);

		this._showStore.add(autorun(r => {
			const busy = activeEntry.isCurrentlyBeingModified.read(r);
			this._domNode.classList.toggle('busy', busy);
		}));

		this._showStore.add(autorun(r => {
			const value = activeEntry.rewriteRatio.read(r);
			reset(this._progressNode, (value === 0
				? localize('generating', "Generating edits...")
				: localize('applyingPercentage', "{0}% Applying edits...", Math.round(value * 100))));
		}));

		this._showStore.add(autorun(r => {

			const ctrl = ChatEditorController.get(this._editor);

			const entryIndex = ctrl?.currentEntryIndex.read(r);
			const changeIndex = ctrl?.currentChangeIndex.read(r);

			const entries = session.entries.read(r);

			let activeIdx = entryIndex !== undefined && changeIndex !== undefined
				? changeIndex
				: -1;

			let changes = 0;
			for (let i = 0; i < entries.length; i++) {
				const diffInfo = entries[i].diffInfo.read(r);
				changes += diffInfo.changes.length;

				if (entryIndex !== undefined && i < entryIndex) {
					activeIdx += diffInfo.changes.length;
				}
			}

			this._navigationBearings.set({ changeCount: changes, activeIdx, entriesCount: entries.length }, undefined);
		}));

		if (!this._isAdded) {
			this._editor.addOverlayWidget(this);
			this._isAdded = true;
		}
	}

	hide() {

		transaction(tx => {
			this._entry.set(undefined, tx);
			this._navigationBearings.set({ changeCount: -1, activeIdx: -1, entriesCount: -1 }, tx);
		});

		if (this._isAdded) {
			this._editor.removeOverlayWidget(this);
			this._isAdded = false;
			this._showStore.clear();
		}
	}
}

export const navigationBearingFakeActionId = 'chatEditor.navigation.bearings';

MenuRegistry.appendMenuItem(MenuId.ChatEditingEditorContent, {
	command: {
		id: navigationBearingFakeActionId,
		title: localize('label', "Navigation Status"),
		precondition: ContextKeyExpr.false(),
	},
	group: 'navigate',
	order: -1
});

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
		const widget = this._store.add(instaService.createInstance(ChatEditorOverlayWidget, this._editor));

		if (this._editor.getOption(EditorOption.inDiffEditor)) {
			return;
		}

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
			widget.show(session, entry, entries[(idx + 1) % entries.length]);

		}));
	}

	dispose() {
		this._store.dispose();
	}
}
