/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { combinedDisposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../../../editor/browser/editorBrowser.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatEditingService, IChatEditingSession, IModifiedFileEntry, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IActionRunner } from '../../../../../base/common/actions.js';
import { $, addDisposableGenericMouseMoveListener, append, EventLike, reset } from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { assertType } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { AcceptAction, navigationBearingFakeActionId, RejectAction } from './chatEditingEditorActions.js';
import '../media/chatEditorOverlay.css';
import { findDiffEditorContainingCodeEditor } from '../../../../../editor/browser/widget/diffEditor/commands.js';
import { IChatService } from '../../common/chatService.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
import { rcut } from '../../../../../base/common/strings.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { EditorGroupView } from '../../../../browser/parts/editor/editorGroupView.js';
import { Event } from '../../../../../base/common/event.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { IInlineChatSessionService } from '../../../inlineChat/browser/inlineChatSessionService.js';
import { URI } from '../../../../../base/common/uri.js';


class ChatEditorOverlayWidget2 {

	private readonly _domNode: HTMLElement;
	private readonly _progressNode: HTMLElement;
	private readonly _toolbar: WorkbenchToolBar;

	private readonly _showStore = new DisposableStore();

	private readonly _entry = observableValue<IModifiedFileEntry | undefined>(this, undefined);

	private readonly _navigationBearings = observableValue<{ changeCount: number; activeIdx: number; entriesCount: number }>(this, { changeCount: -1, activeIdx: -1, entriesCount: -1 });

	constructor(
		private readonly _editor: { focus(): void },
		@IHoverService private readonly _hoverService: IHoverService,
		@IChatService private readonly _chatService: IChatService,
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
							// ChatEditorController.get(that._editor)?.unlockScroll();
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

									const ctrl = that._entry.read(r)?.autoAcceptController.read(r);
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
							this._reveal.value = actionRunner.onWillRun(_e => {
								that._editor.focus();
							});
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


	getDomNode(): HTMLElement {
		return this._domNode;
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

	}

	showEntry(session: IChatEditingSession, activeEntry: IModifiedFileEntry, indicies: { entryIndex: IObservable<number | undefined>; changeIndex: IObservable<number | undefined> }) {

		this._showStore.clear();

		this._entry.set(activeEntry, undefined);

		this._showStore.add(autorun(r => {
			const busy = activeEntry.isCurrentlyBeingModifiedBy.read(r);
			this._domNode.classList.toggle('busy', !!busy);
		}));

		this._showStore.add(autorun(r => {
			const paused = activeEntry.isCurrentlyBeingModifiedBy.read(r)?.isPaused.read(r);
			const progress = activeEntry.rewriteRatio.read(r);

			const text = paused
				? localize('paused', "Edits Paused")
				: progress === 0
					? localize('generating', "Generating Edits")
					: localize('applyingPercentage', "{0}% Applying Edits", Math.round(progress * 100));

			this._domNode.classList.toggle('paused', !!paused);
			reset(this._progressNode, text);
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

	}

	hide() {
		transaction(tx => {
			this._entry.set(undefined, tx);
			this._navigationBearings.set({ changeCount: -1, activeIdx: -1, entriesCount: -1 }, tx);
		});
		this._showStore.clear();
	}
}


class ChatEditorOverlayWidget implements IOverlayWidget {

	readonly allowEditorOverflow = true;

	private readonly _widget: ChatEditorOverlayWidget2;


	private _isAdded: IDisposable | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) {
		this._widget = _instaService.createInstance(ChatEditorOverlayWidget2, _editor);
	}

	dispose() {
		this._widget.dispose();
		this.hide();
	}

	getId(): string {
		return 'chatEditorOverlayWidget';
	}

	getDomNode(): HTMLElement {
		return this._widget.getDomNode();
	}

	getPosition(): IOverlayWidgetPosition | null {
		return { preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER };
	}

	showRequest(session: IChatEditingSession) {

		this._widget.showRequest(session);
		this._show();
	}

	showEntry(session: IChatEditingSession, activeEntry: IModifiedFileEntry, indicies: { entryIndex: IObservable<number | undefined>; changeIndex: IObservable<number | undefined> }) {
		this._widget.showEntry(session, activeEntry, indicies);
		this._show();
	}

	private _show(): void {

		const editorWidthObs = observableFromEvent(this._editor.onDidLayoutChange, () => {
			const diffEditor = this._instaService.invokeFunction(findDiffEditorContainingCodeEditor, this._editor);
			return diffEditor
				? diffEditor.getOriginalEditor().getLayoutInfo().contentWidth + diffEditor.getModifiedEditor().getLayoutInfo().contentWidth
				: this._editor.getLayoutInfo().contentWidth;
		});


		if (!this._isAdded) {
			this._editor.addOverlayWidget(this);
			this._isAdded = autorun(r => {
				const width = editorWidthObs.read(r);
				this.getDomNode().style.maxWidth = `${width - 20}px`;
			});
		}
	}

	hide() {

		this._widget.hide();

		if (this._isAdded) {
			this._editor.removeOverlayWidget(this);
			this._isAdded.dispose();
			this._isAdded = undefined;
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
		activeEntry: IModifiedFileEntry,
		indicies: { entryIndex: IObservable<number | undefined>; changeIndex: IObservable<number | undefined> }
	) {
		this._overlayWidget.value.showEntry(session, activeEntry, indicies);
	}

	hide() {
		this._overlayWidget.rawValue?.hide();
	}
}


export class ChatEditingEditorOverlay implements IWorkbenchContribution {

	static readonly ID = 'chat.edits.editorOverlay';

	private readonly _store = new DisposableStore();

	constructor(
		@IChatEditingService chatEditingService: IChatEditingService,
		@IInlineChatSessionService inlineChatService: IInlineChatSessionService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {

		const editorGroups = observableFromEvent(
			this,
			Event.any(editorGroupsService.onDidAddGroup, editorGroupsService.onDidRemoveGroup),
			() => editorGroupsService.groups.filter(g => g instanceof EditorGroupView)
		);

		const overlayWidgets = new DisposableMap<IEditorGroup>();

		this._store.add(autorun(r => {

			const toDelete = new Set(overlayWidgets.keys());
			const groups = editorGroups.read(r);

			for (const group of groups) {

				// find editor
				const editor = observableFromEvent(this, group.onDidModelChange, () => group.activeEditor).read(r);
				const uri = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
				if (!uri) {
					continue;
				}

				// find the effective session (prefer inline chat)
				const inlineSessionObs = observableFromEvent(this, inlineChatService.onDidChangeSessions, () => inlineChatService.getSession2(uri));
				const sessionObs = chatEditingService.editingSessionsObs.map((value, r) => value.find(s => s.readEntry(uri, r)));
				const session = inlineSessionObs.read(r)?.editingSession ?? sessionObs.read(r);

				if (!session) {
					continue;
				}

				toDelete.delete(group); // we keep the widget for this group!

				if (!overlayWidgets.has(group)) {

					const scopedInstaService = instantiationService.createChild(
						new ServiceCollection([IContextKeyService, group.scopedContextKeyService])
					);

					const ctrl = scopedInstaService.createInstance(ChatEditingOverlayController, session, group, uri);
					overlayWidgets.set(group, combinedDisposable(ctrl, scopedInstaService));

					// TODO@jrieken UGLY, fix in https://github.com/microsoft/vscode/tree/ben/layout-group-container
					(group as EditorGroupView).element.appendChild(ctrl.domNode);
				}
			}

			for (const group of toDelete) {
				overlayWidgets.deleteAndDispose(group);
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
	}
}

class ChatEditingOverlayController {

	private readonly _store = new DisposableStore();

	readonly domNode = document.createElement('div');

	constructor(
		session: IChatEditingSession,
		group: IEditorGroup,
		uri: URI,
		@IInstantiationService instaService: IInstantiationService,
		@IChatService chatService: IChatService,
	) {

		this.domNode.classList.add('chat-editing-editor-overlay');
		this.domNode.style.position = 'absolute';
		this.domNode.style.bottom = `24px`;
		this.domNode.style.left = `20px`;

		const widget = instaService.createInstance(ChatEditorOverlayWidget2, group);
		this.domNode.appendChild(widget.getDomNode());
		this._store.add(toDisposable(() => this.domNode.remove()));
		this._store.add(widget);

		const chatModel = chatService.getSession(session.chatSessionId)!;
		const lastResponse = observableFromEvent(this, chatModel.onDidChange, () => chatModel.getRequests().at(-1)?.response);

		this._store.add(autorun(r => {

			const response = lastResponse.read(r);

			const isInProgress = response
				? observableFromEvent(this, response.onDidChange, () => !response.isComplete)
				: constObservable(false);

			const entry = session.readEntry(uri, r);

			if (entry?.state.read(r) === WorkingSetEntryState.Modified) {
				widget.showEntry(session, entry, { entryIndex: constObservable(-1), changeIndex: constObservable(-1) });
				this.domNode.style.display = '';

			} else if (!session.isGlobalEditingSession && isInProgress.read(r)) {
				widget.showRequest(session);
				this.domNode.style.display = '';

			} else {
				this.domNode.style.display = 'none';
				widget.hide();
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
	}
}
