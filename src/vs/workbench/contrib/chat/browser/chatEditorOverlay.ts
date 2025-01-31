/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../../editor/browser/editorBrowser.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatEditingSession, IModifiedFileEntry } from '../common/chatEditingService.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ACTIVE_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IActionRunner } from '../../../../base/common/actions.js';
import { $, addDisposableGenericMouseMoveListener, append, EventLike, reset } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { assertType } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { AcceptAction, navigationBearingFakeActionId, RejectAction } from './chatEditorActions.js';
import { ChatEditorController } from './chatEditorController.js';
import './media/chatEditorOverlay.css';
import { findDiffEditorContainingCodeEditor } from '../../../../editor/browser/widget/diffEditor/commands.js';
import { IChatService } from '../common/chatService.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { rcut } from '../../../../base/common/strings.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { Lazy } from '../../../../base/common/lazy.js';

class ChatEditorOverlayWidget implements IOverlayWidget {

	readonly allowEditorOverflow = true;

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
		@IHoverService private readonly _hoverService: IHoverService,
		@IChatService private readonly _chatService: IChatService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
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

		this._toolbar = _instaService.createInstance(MenuWorkbenchToolBar, toolbarNode, MenuId.ChatEditingEditorContent, {
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

						override render(container: HTMLElement): void {
							super.render(container);

							if (action.id === AcceptAction.ID) {

								const listener = this._store.add(new MutableDisposable());

								this._store.add(autorun(r => {

									assertType(this.label);
									assertType(this.element);

									const ctrl = that._entry.read(r)?.entry.autoAcceptController.read(r);
									if (ctrl) {

										const r = -100 * (ctrl.remaining / ctrl.total);

										this.element.style.setProperty('--vscode-action-item-auto-timeout', `${r}%`);

										this.element.classList.toggle('auto', true);
										listener.value = addDisposableGenericMouseMoveListener(this.element, () => ctrl.cancel());
									} else {
										this.element.classList.toggle('auto', false);
										listener.clear();
									}
								}));
							}
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

	showRequest(session: IChatEditingSession) {

		this._showStore.clear();

		const chatModel = this._chatService.getSession(session.chatSessionId);
		const chatRequest = chatModel?.getRequests().at(-1);

		if (!chatRequest || !chatRequest.response) {
			this.hide();
			return;
		}

		this._domNode.classList.toggle('busy', true);

		const message = rcut(chatRequest.message.text, 47);
		reset(this._progressNode, message);

		this._showStore.add(this._hoverService.setupDelayedHover(this._progressNode, {
			content: chatRequest.message.text,
			appearance: { showPointer: true }
		}));

		this._show();
	}

	showEntry(session: IChatEditingSession, activeEntry: IModifiedFileEntry, next: IModifiedFileEntry, indicies: { entryIndex: IObservable<number | undefined>; changeIndex: IObservable<number | undefined> }) {

		this._showStore.clear();

		this._entry.set({ entry: activeEntry, next }, undefined);

		this._showStore.add(autorun(r => {
			const busy = activeEntry.isCurrentlyBeingModified.read(r);
			this._domNode.classList.toggle('busy', busy);
		}));

		this._showStore.add(autorun(r => {
			const value = activeEntry.rewriteRatio.read(r);
			reset(this._progressNode, (value === 0
				? localize('generating', "Generating Edits")
				: localize('applyingPercentage', "{0}% Applying Edits", Math.round(value * 100))));
		}));

		this._showStore.add(autorun(r => {

			const entryIndex = indicies.entryIndex.read(r);
			const changeIndex = indicies.changeIndex.read(r);

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

		this._show();
	}

	private _show(): void {

		const editorWidthObs = observableFromEvent(this._editor.onDidLayoutChange, () => {
			const diffEditor = this._instaService.invokeFunction(findDiffEditorContainingCodeEditor, this._editor);
			return diffEditor
				? diffEditor.getOriginalEditor().getLayoutInfo().contentWidth + diffEditor.getModifiedEditor().getLayoutInfo().contentWidth
				: this._editor.getLayoutInfo().contentWidth;
		});

		this._showStore.add(autorun(r => {
			const width = editorWidthObs.read(r);
			this._domNode.style.maxWidth = `${width - 20}px`;
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


export class ChatEditorOverlayController implements IEditorContribution {

	static readonly ID = 'editor.contrib.chatEditorOverlayController';

	static get(editor: ICodeEditor): ChatEditorOverlayController | undefined {
		return editor.getContribution<ChatEditorOverlayController>(ChatEditorOverlayController.ID) ?? undefined;
	}

	private readonly _overlayWidget = new Lazy(() => this._instaService.createInstance(ChatEditorOverlayWidget, this._editor));

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) { }

	dispose(): void {
		this.hide();
		this._overlayWidget.rawValue?.dispose();
	}

	showRequest(session: IChatEditingSession) {
		this._overlayWidget.value.showRequest(session);
	}

	showEntry(session: IChatEditingSession,
		activeEntry: IModifiedFileEntry, next: IModifiedFileEntry,
		indicies: { entryIndex: IObservable<number | undefined>; changeIndex: IObservable<number | undefined> }
	) {
		this._overlayWidget.value.showEntry(session, activeEntry, next, indicies);
	}

	hide() {
		this._overlayWidget.rawValue?.hide();
	}
}
