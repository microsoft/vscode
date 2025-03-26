/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/chatEditingEditorOverlay.css';
import { combinedDisposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, observableFromEvent, observableSignalFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatEditingService, IChatEditingSession, IModifiedFileEntry, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IActionRunner } from '../../../../../base/common/actions.js';
import { addDisposableGenericMouseMoveListener, append, reset } from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { assertType } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { AcceptAction, navigationBearingFakeActionId, RejectAction } from './chatEditingEditorActions.js';
import { IChatService } from '../../common/chatService.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { EditorGroupView } from '../../../../browser/parts/editor/editorGroupView.js';
import { Event } from '../../../../../base/common/event.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { IInlineChatSessionService } from '../../../inlineChat/browser/inlineChatSessionService.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ObservableEditorSession } from './chatEditingEditorContextKeys.js';
import { rcut } from '../../../../../base/common/strings.js';

class ChatEditorOverlayWidget {

	private readonly _domNode: HTMLElement;
	// private readonly _progressNode: HTMLElement;
	private readonly _toolbar: WorkbenchToolBar;

	private readonly _showStore = new DisposableStore();

	private readonly _session = observableValue<IChatEditingSession | undefined>(this, undefined);
	private readonly _entry = observableValue<IModifiedFileEntry | undefined>(this, undefined);

	private readonly _navigationBearings = observableValue<{ changeCount: number; activeIdx: number; entriesCount: number }>(this, { changeCount: -1, activeIdx: -1, entriesCount: -1 });

	constructor(
		private readonly _editor: { focus(): void },
		@IChatService private readonly _chatService: IChatService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		this._domNode = document.createElement('div');
		this._domNode.classList.add('chat-editor-overlay-widget');

		const progressNode = document.createElement('div');
		progressNode.classList.add('chat-editor-overlay-progress');
		append(progressNode, renderIcon(ThemeIcon.modify(Codicon.loading, 'spin')));
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

								if (changeCount > 0) {
									const n = activeIdx === -1 ? '1' : `${activeIdx + 1}`;
									this.label.innerText = localize('nOfM', "{0} of {1}", n, changeCount);
								} else {
									this.label.innerText = localize('0Of0', "0 of 0");
								}

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

				if (action.id === 'inlineChat2.reveal' || action.id === 'workbench.action.chat.openEditSession') {
					return new class extends ActionViewItem {

						private _requestMessage: IObservable<{ message: string; paused?: boolean } | undefined>;

						constructor() {
							super(undefined, action, options);

							this._requestMessage = derived(r => {
								const session = that._session.read(r);
								const chatModel = that._chatService.getSession(session?.chatSessionId ?? '');
								if (!session || !chatModel) {
									return undefined;
								}

								const response = that._entry.read(r)?.isCurrentlyBeingModifiedBy.read(r);

								if (response) {

									if (response?.isPaused.read(r)) {
										return { message: localize('paused', "Edits Paused"), paused: true };
									}

									const entry = that._entry.read(r);
									if (entry) {
										const progress = entry?.rewriteRatio.read(r);
										const message = progress === 0
											? localize('generating', "Generating edits")
											: localize('applyingPercentage', "{0}% Applying edits", Math.round(progress * 100));

										return { message };
									}
								}

								if (session.isGlobalEditingSession) {
									return undefined;
								}

								const request = observableFromEvent(this, chatModel.onDidChange, () => chatModel.getRequests().at(-1)).read(r);
								if (!request || request.response?.isComplete) {
									return undefined;
								}
								return { message: request.message.text };
							});
						}

						override render(container: HTMLElement) {
							super.render(container);

							container.classList.add('label-item');

							this._store.add(autorun(r => {
								assertType(this.label);

								const value = this._requestMessage.read(r);
								if (!value) {
									// normal rendering
									this.options.icon = true;
									this.options.label = false;
									reset(this.label);
									this.updateClass();
									this.updateLabel();
									this.updateTooltip();

								} else {
									this.options.icon = false;
									this.options.label = true;
									this.updateClass();
									this.updateTooltip();

									const message = rcut(value.message, 47);
									reset(this.label, message);
								}

								const busy = Boolean(value && !value.paused);
								that._domNode.classList.toggle('busy', busy);
								this.label.classList.toggle('busy', busy);

							}));
						}

						protected override getTooltip(): string | undefined {
							return this._requestMessage.get()?.message || super.getTooltip();
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

	show(session: IChatEditingSession, entry: IModifiedFileEntry | undefined, indicies: { entryIndex: IObservable<number>; changeIndex: IObservable<number> }) {

		this._showStore.clear();

		transaction(tx => {
			this._session.set(session, tx);
			this._entry.set(entry, tx);
		});

		this._showStore.add(autorun(r => {

			const entryIndex = indicies.entryIndex.read(r);
			const changeIndex = indicies.changeIndex.read(r);

			const entries = session.entries.read(r);

			let activeIdx = entryIndex !== undefined && changeIndex !== undefined
				? changeIndex
				: -1;

			let totalChangesCount = 0;
			for (let i = 0; i < entries.length; i++) {
				const changesCount = entries[i].changesCount.read(r);
				totalChangesCount += changesCount;

				if (entryIndex !== undefined && i < entryIndex) {
					activeIdx += changesCount;
				}
			}

			this._navigationBearings.set({ changeCount: totalChangesCount, activeIdx, entriesCount: entries.length }, undefined);
		}));

	}

	hide() {
		transaction(tx => {
			this._session.set(undefined, tx);
			this._entry.set(undefined, tx);
			this._navigationBearings.set({ changeCount: -1, activeIdx: -1, entriesCount: -1 }, tx);
		});
		this._showStore.clear();
	}
}

class ChatEditingOverlayController {

	private readonly _store = new DisposableStore();

	private readonly _domNode = document.createElement('div');

	constructor(
		container: HTMLElement,
		group: IEditorGroup,
		@IInstantiationService instaService: IInstantiationService,
		@IChatService chatService: IChatService,
		@IChatEditingService chatEditingService: IChatEditingService,
		@IInlineChatSessionService inlineChatService: IInlineChatSessionService
	) {

		this._domNode.classList.add('chat-editing-editor-overlay');
		this._domNode.style.position = 'absolute';
		this._domNode.style.bottom = `24px`;
		this._domNode.style.right = `24px`;
		this._domNode.style.zIndex = `100`;

		const widget = instaService.createInstance(ChatEditorOverlayWidget, group);
		this._domNode.appendChild(widget.getDomNode());
		this._store.add(toDisposable(() => this._domNode.remove()));
		this._store.add(widget);

		const show = () => {
			if (!container.contains(this._domNode)) {
				container.appendChild(this._domNode);
			}
		};

		const hide = () => {
			if (container.contains(this._domNode)) {
				widget.hide();
				this._domNode.remove();
			}
		};

		const activeEditorSignal = observableSignalFromEvent(this, Event.any(group.onDidActiveEditorChange, group.onDidModelChange));

		const activeUriObs = derivedOpts({ equalsFn: isEqual }, r => {

			activeEditorSignal.read(r); // signal

			const editor = group.activeEditorPane;
			const uri = EditorResourceAccessor.getOriginalUri(editor?.input, { supportSideBySide: SideBySideEditor.PRIMARY });

			return uri;
		});

		const sessionAndEntry = derived(r => {

			activeEditorSignal.read(r); // signal to ensure activeEditor and activeEditorPane don't go out of sync

			const uri = activeUriObs.read(r);
			if (!uri) {
				return undefined;
			}

			return new ObservableEditorSession(uri, chatEditingService, inlineChatService).value.read(r);
		});

		const isInProgress = derived(r => {

			const session = sessionAndEntry.read(r)?.session;
			if (!session) {
				return false;
			}

			const chatModel = chatService.getSession(session.chatSessionId)!;
			const lastResponse = observableFromEvent(this, chatModel.onDidChange, () => chatModel.getRequests().at(-1)?.response);

			const response = lastResponse.read(r);
			if (!response) {
				return false;
			}
			return observableFromEvent(this, response.onDidChange, () => !response.isComplete).read(r);
		});

		this._store.add(autorun(r => {

			const data = sessionAndEntry.read(r);

			if (!data) {
				hide();
				return;
			}

			const { session, entry } = data;

			if (
				entry?.state.read(r) === WorkingSetEntryState.Modified // any entry changing
				|| (!session.isGlobalEditingSession && isInProgress.read(r)) // inline chat request
			) {
				// any session with changes
				const editorPane = group.activeEditorPane;
				assertType(editorPane);

				const changeIndex = derived(r => entry
					? entry.getEditorIntegration(editorPane).currentIndex.read(r)
					: 0);

				const entryIndex = derived(r => entry
					? session.entries.read(r).indexOf(entry)
					: 0
				);

				widget.show(session, entry, { entryIndex, changeIndex });
				show();

			} else {
				// nothing
				hide();
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
	}
}

export class ChatEditingEditorOverlay implements IWorkbenchContribution {

	static readonly ID = 'chat.edits.editorOverlay';

	private readonly _store = new DisposableStore();

	constructor(
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {

		const editorGroups = observableFromEvent(
			this,
			Event.any(editorGroupsService.onDidAddGroup, editorGroupsService.onDidRemoveGroup),
			() => editorGroupsService.groups
		);

		const overlayWidgets = new DisposableMap<IEditorGroup>();

		this._store.add(autorun(r => {

			const toDelete = new Set(overlayWidgets.keys());
			const groups = editorGroups.read(r);


			for (const group of groups) {

				if (!(group instanceof EditorGroupView)) {
					// TODO@jrieken better with https://github.com/microsoft/vscode/tree/ben/layout-group-container
					continue;
				}

				toDelete.delete(group); // we keep the widget for this group!

				if (!overlayWidgets.has(group)) {

					const scopedInstaService = instantiationService.createChild(
						new ServiceCollection([IContextKeyService, group.scopedContextKeyService])
					);

					const container = group.element;

					const ctrl = scopedInstaService.createInstance(ChatEditingOverlayController, container, group);
					overlayWidgets.set(group, combinedDisposable(ctrl, scopedInstaService));
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
