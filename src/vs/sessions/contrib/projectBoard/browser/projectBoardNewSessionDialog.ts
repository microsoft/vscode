/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { State as SuggestState } from '../../../../editor/contrib/suggest/browser/suggestModel.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResultKind } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { createWorkbenchDialogOptions } from '../../../../workbench/browser/parts/dialogs/dialog.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { isMobilePickerSheetTarget } from '../../../browser/parts/mobile/mobilePickerSheet.js';
import { registerSessionDialogKeyboardNavigation, sessionDialogAllowableCommands } from '../../../browser/sessionDialogKeyboardNavigation.js';
import { SessionUsesCombinedConfigPickerContext } from '../../../common/contextkeys.js';
import { VisibleSession } from '../../../services/sessions/browser/visibleSessions.js';
import { ISession, SessionStatus, SessionTypeAuthRequirement } from '../../../services/sessions/common/session.js';
import { setActiveSessionContextKeys } from '../../../services/sessions/common/sessionContextKeys.js';
import { IActiveSession, ICreateNewSessionOptions, ISessionDraft, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { INewChatWidgetHost, NewChatWidget } from '../../chat/browser/newChatWidget.js';
import { INewSessionComposerService, NewSessionComposerService } from '../../chat/browser/newSessionComposerService.js';
import { IProjectBoardPlacement } from '../common/projectBoardConfiguration.js';
import { ProjectBoardState } from './projectBoardState.js';

export interface IProjectBoardNewSessionOptions {
	readonly container: HTMLElement;
	readonly boardState: ProjectBoardState;
	readonly onDidCreate: (session: ISession, placement: IProjectBoardPlacement | undefined) => void;
	readonly onDidResolve?: (from: ISession, to: ISession) => void;
}

interface IModalDraft {
	readonly draft: ISessionDraft;
	readonly source: ISession;
	readonly visible: VisibleSession;
	readonly folderUri: URI | undefined;
}

export class ProjectBoardNewSessionDialog extends Disposable {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IHostService private readonly hostService: IHostService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@ILogService private readonly logService: ILogService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
	}

	async show(options: IProjectBoardNewSessionOptions): Promise<ISession | undefined> {
		const store = this._register(new DisposableStore());
		const composerServices = new DisposableStore();
		const { container, boardState } = options;
		const targetWindow = dom.getWindow(container);
		const surface = targetWindow === mainWindow ? 'embedded' : 'standalone';
		const session = observableValue<IActiveSession | undefined>(this, undefined);
		const configuration = boardState.configuration.get();
		const destinations = [
			...(configuration.autoIncludeSessions ? [{ text: localize('projectBoard.unassigned', "Unassigned"), placement: undefined }] : []),
			...configuration.rows.flatMap(row => configuration.columns.map(column => ({
				text: localize('projectBoard.destinationCell', "{0} / {1}", row.label, column.label),
				placement: { rowId: row.id, columnId: column.id },
			}))),
		];
		let placement: IProjectBoardPlacement | undefined = destinations[0]?.placement;
		let current: IModalDraft | undefined;
		let transferredDraft: ISessionDraft | undefined;
		let generation = 0;
		let closed = false;
		let sending = false;
		let submitted = false;
		let submittedSession: ISession | undefined;
		let closeWithResult = false;
		let widget: NewChatWidget | undefined;
		let dialog: Dialog | undefined;
		let body: HTMLElement | undefined;
		let composer: HTMLElement | undefined;
		let errorElement: HTMLElement | undefined;
		let sendingStatus: HTMLElement | undefined;
		let message: string | undefined;

		const setSending = (value: boolean) => {
			sending = value;
			if (closed) {
				return;
			}
			body?.toggleAttribute('inert', value);
			body?.setAttribute('aria-busy', String(value));
			// eslint-disable-next-line no-restricted-syntax -- Dialog exposes no mutable close-action handle.
			body?.closest('.monaco-dialog-box')?.querySelector('.dialog-toolbar-row')?.toggleAttribute('inert', value);
			if (sendingStatus) {
				sendingStatus.hidden = !value;
			}
		};
		const showError = (value: string | undefined, error?: unknown) => {
			if (error) {
				this.logService.error('[Agents Hub] New session failed', error);
			}
			message = value;
			if (!closed && errorElement) {
				errorElement.textContent = value ?? '';
				errorElement.hidden = !value;
			}
		};
		const clearDraft = () => {
			generation++;
			session.set(undefined, undefined);
			const previous = current;
			current = undefined;
			previous?.visible.dispose();
			if (previous?.draft !== transferredDraft) {
				previous?.draft.dispose();
			}
		};
		const disposeComposer = () => {
			widget?.saveState();
			widget?.dispose();
			widget = undefined;
			composerServices.dispose();
			clearDraft();
		};
		store.add(toDisposable(() => {
			closed = true;
			generation++;
			// An accepted send may still be clearing the shared input. Keep it alive
			// until its continuation has run, even if the user closes the modal.
			if (!sending) {
				disposeComposer();
			}
		}));
		const targetAvailable = (folderUri: URI | undefined, target: ICreateNewSessionOptions) => folderUri
			? this.sessionsManagementService.isNewSessionTargetAvailable(folderUri, target)
			: this.sessionsManagementService.isQuickChatTargetAvailable(target);
		const validatePlacement = () => {
			if (!boardState.isAvailable.get() || !boardState.canEdit) {
				throw new Error(localize('projectBoard.newSessionBoardUnavailable', "This board is no longer available for editing. Your prompt has been kept."));
			}
			const latest = boardState.configuration.get();
			const destination = placement;
			if (destination
				? !latest.rows.some(row => row.id === destination.rowId) || !latest.columns.some(column => column.id === destination.columnId)
				: !latest.autoIncludeSessions) {
				throw new Error(localize('projectBoard.newSessionPlacementUnavailable', "The selected project path is no longer available. Your prompt has been kept; reopen New Session to choose a project path."));
			}
		};
		const host: INewChatWidgetHost = {
			session,
			draftStorageKey: `sessions.agentHub.newSessionDraft.${boardState.boardId}.${surface}`,
			clearSession: () => {
				if (!sending) {
					clearDraft();
					showError(undefined);
				}
			},
			createSession: async (folderUri, creationOptions, token) => {
				const empty = { session: undefined, trustDeclined: false };
				if (closed || token.isCancellationRequested || sending || submitted) {
					return empty;
				}
				clearDraft();
				showError(undefined);
				const requestGeneration = generation;
				const isCurrent = () => !closed && !token.isCancellationRequested && generation === requestGeneration;
				let draft: ISessionDraft | undefined;
				try {
					const types = folderUri ? this.sessionsManagementService.getSessionTypesForFolder(folderUri) : this.sessionsManagementService.getQuickChatSessionTypes();
					const target = types.find(candidate => (!creationOptions.providerId || candidate.providerId === creationOptions.providerId)
						&& (!creationOptions.sessionTypeId || candidate.sessionType.id === creationOptions.sessionTypeId)
						&& candidate.sessionType.authRequirement !== SessionTypeAuthRequirement.Unusable);
					if (!target) {
						throw new Error(localize('projectBoard.newSessionNoProvider', "No available agent can start a session in this workspace."));
					}
					const selected = { ...creationOptions, providerId: target.providerId, sessionTypeId: target.sessionType.id };
					if (folderUri) {
						const resolved = this.sessionsManagementService.resolveWorkspace(folderUri, selected.providerId);
						if (!resolved || resolved.providerId !== selected.providerId) {
							throw new Error(localize('projectBoard.newSessionWorkspaceUnavailable', "The selected workspace is no longer available."));
						}
						if (resolved.workspace.requiresWorkspaceTrust) {
							const trusted = await this.workspaceTrustRequestService.requestResourcesTrust({
								uri: folderUri,
								message: localize('projectBoard.newSessionTrust', "An agent session will be able to read files, run commands, and make changes in this folder."),
							});
							if (!isCurrent()) {
								return empty;
							}
							if (!trusted) {
								showError(localize('projectBoard.newSessionTrustDeclined', "Workspace trust is required to start this session. Choose a workspace to try again."));
								return { session: undefined, trustDeclined: true };
							}
						}
					}
					if (!isCurrent()) {
						return empty;
					}
					if (!targetAvailable(folderUri, selected)) {
						throw new Error(localize('projectBoard.newSessionProviderUnavailable', "The selected agent is no longer available. Choose an available agent to continue."));
					}
					draft = await this.sessionsManagementService.createSessionDraft(folderUri, selected);
					if (!isCurrent()) {
						draft.dispose();
						return empty;
					}
					if (!targetAvailable(folderUri, selected)) {
						throw new Error(localize('projectBoard.newSessionProviderUnavailable', "The selected agent is no longer available. Choose an available agent to continue."));
					}
					const visible = new VisibleSession(draft.session, draft.session.mainChat.get());
					current = { draft, source: draft.session, visible, folderUri };
					session.set(visible, undefined);
					return { session: draft.session, trustDeclined: false };
				} catch (error) {
					draft?.dispose();
					if (isCurrent() && !isCancellationError(error)) {
						showError(toErrorMessage(error), error);
					}
					return empty;
				}
			},
			sendRequest: async (active, request) => {
				const selected = current;
				if (closed || sending || submitted) {
					return false;
				}
				let started = false;
				try {
					if (!selected || selected.visible !== active || !targetAvailable(selected.folderUri, { providerId: active.providerId, sessionTypeId: active.sessionType })) {
						throw new Error(localize('projectBoard.newSessionProviderUnavailable', "The selected agent is no longer available. Choose an available agent to continue."));
					}
					validatePlacement();
					showError(undefined);
					setSending(true);
					started = true;
					const destination = placement && { ...placement };
					const ready = new DeferredPromise<ISession>();
					const send = selected.draft.send({ ...request, background: true });
					const observer = autorun(reader => {
						this.sessionsManagementService.sessionDrafts.read(reader);
						const candidate = selected.draft.session;
						const status = candidate.status.read(reader);
						// Use the running provisional chat, as SessionView does, without
						// treating an unpublished send failure as an accepted request.
						if (status !== SessionStatus.Untitled && status !== SessionStatus.Error && !ready.isSettled) {
							void ready.complete(candidate);
						}
					});
					const outcome = await Promise.race([
						send.then(session => ({ session, pending: false })),
						ready.p.then(session => ({ session, pending: true })),
					]).finally(() => observer.dispose());
					const created = outcome.session;
					submitted = true;
					if (!created) {
						this.logService.warn('[Agents Hub] Session sent during shutdown; no canonical session is available for placement.');
						return true;
					}
					submittedSession = created;
					try {
						options.onDidCreate(created, destination);
					} catch (error) {
						// Provider submission has committed. A placement failure must never
						// return false and invite a duplicate send.
						showError(localize('projectBoard.newSessionPlacementFailed', "The session started, but its project path could not be saved."), error);
					}
					if (outcome.pending) {
						// The send, not the now-dismissable composer, owns the draft until
						// canonical discovery settles. Disposing it here cancels that wait.
						transferredDraft = selected.draft;
						void send.then(canonical => {
							if (canonical) {
								submittedSession = canonical;
								options.onDidResolve?.(created, canonical);
							} else {
								this.logService.warn('[Agents Hub] Session sent during shutdown; canonical discovery did not finish.');
							}
						}).catch(error => {
							this.logService.error('[Agents Hub] Failed to finalize started session', error);
							this.notificationService.error(localize('projectBoard.newSessionFinalizeFailed', "The session started, but could not be finalized: {0}. Check the conversation before sending again.", toErrorMessage(error)));
						}).finally(() => selected.draft.dispose());
					}
					return true;
				} catch (error) {
					if (!isCancellationError(error)) {
						showError(toErrorMessage(error), error);
					}
					return false;
				} finally {
					// NewChatInput clears successful requests after awaiting this host.
					// Disposing in this continuation would save the old input or access
					// an already-disposed editor.
					if (started) {
						setTimeout(() => {
							setSending(false);
							if (closed) {
								disposeComposer();
							} else if (submitted) {
								closeWithResult = true;
								dialog?.dispose();
							} else {
								if (current && current.draft === selected?.draft && current.source !== current.draft.session) {
									const visible = new VisibleSession(current.draft.session, current.draft.session.mainChat.get());
									current.visible.dispose();
									current = { ...current, source: current.draft.session, visible };
									session.set(visible, undefined);
								}
								widget?.saveState();
							}
						}, 0);
					}
				}
			},
		};

		try {
			container.classList.add('project-board-new-session-open');
			store.add(toDisposable(() => container.classList.remove('project-board-new-session-open')));
			const blockSendingDismissal = (event: KeyboardEvent) => {
				if (sending && event.key === 'Escape') {
					event.preventDefault();
					event.stopImmediatePropagation();
				}
			};
			store.add(dom.addDisposableListener(targetWindow, dom.EventType.KEY_DOWN, blockSendingDismissal, true));
			store.add(dom.addDisposableListener(targetWindow, dom.EventType.KEY_UP, blockSendingDismissal, true));
			const isPopupTarget = (target: HTMLElement) => isMobilePickerSheetTarget(target) || !!target.closest('.context-view, .quick-input-widget, .monaco-menu-container, .monaco-hover, .suggest-widget, .sessions-chat-editor-overflow');
			const suggestion = () => {
				const editor = this.codeEditorService.getFocusedCodeEditor();
				if (!editor || !composer?.contains(editor.getDomNode()) || !editor.hasTextFocus()) {
					return undefined;
				}
				const controller = SuggestController.get(editor);
				return controller?.model.state !== SuggestState.Idle ? controller : undefined;
			};
			store.add(registerSessionDialogKeyboardNavigation(
				targetWindow,
				() => {
					// eslint-disable-next-line no-restricted-syntax -- The dialog owns this subtree and its dynamic focus order.
					return Array.from(container.querySelectorAll<HTMLElement>('.project-board-new-session-dialog input, .project-board-new-session-dialog textarea, .project-board-new-session-dialog select, .project-board-new-session-dialog button, .project-board-new-session-dialog [tabindex]'));
				},
				isPopupTarget,
				() => {
					const controller = suggestion();
					if (!controller?.widget.value.getFocusedItem()) {
						return false;
					}
					controller.acceptSelectedSuggestion(true, false);
					return true;
				},
				() => {
					const controller = suggestion();
					if (!controller) {
						return false;
					}
					controller.cancelSuggestWidget();
					return true;
				},
			));
			dialog = store.add(new Dialog(container, localize('projectBoard.newSession', "New Session"), [], createWorkbenchDialogOptions({
				type: 'none',
				disableDefaultAction: true,
				extraClasses: ['project-board-new-session-dialog'],
				isExternalFocusAllowed: isPopupTarget,
				keyEventProcessor: event => {
					const resolved = this.keybindingService.softDispatch(event, container);
					const editing = !!composer?.contains(event.target) && (dom.isEditableElement(event.target) || !!event.target.closest('.monaco-editor'));
					if (resolved.kind === ResultKind.KbFound && resolved.commandId && !sessionDialogAllowableCommands.has(resolved.commandId)
						&& !(editing && /^(undo$|redo$|type$|default:type$|cursor|delete|editor\.|acceptSelectedSuggestion$|hideSuggestWidget$|select.*Suggestion|toggleSuggestDetails$)/.test(resolved.commandId))) {
						dom.EventHelper.stop(event, true);
					}
				},
				renderBody: parent => {
					body = dom.append(parent, dom.$('.project-board-new-session-body', { 'data-board-id': boardState.boardId }));
					const destination = dom.append(body, dom.$('.project-board-new-session-destination'));
					dom.append(destination, dom.$('span', undefined, localize('projectBoard.newSessionProjectPath', "Project Path")));
					const picker = store.add(new SelectBox(destinations, 0, this.contextViewService, defaultSelectBoxStyles, { ariaLabel: localize('projectBoard.newSessionProjectPath', "Project Path"), useCustomDrawn: true }));
					picker.render(destination);
					const updatePlacement = () => {
						body?.setAttribute('data-row-id', placement?.rowId ?? '');
						body?.setAttribute('data-column-id', placement?.columnId ?? '');
					};
					store.add(picker.onDidSelect(event => {
						placement = destinations[event.index]?.placement;
						updatePlacement();
						showError(undefined);
					}));
					updatePlacement();
					composer = dom.append(body, dom.$('.project-board-new-session-composer'));
					errorElement = dom.append(body, dom.$('.project-board-new-session-error', { role: 'alert' }));
					sendingStatus = dom.append(parent, dom.$('p.project-board-new-session-status', { role: 'status' }, localize('projectBoard.newSessionSending', "Starting session. Please wait before closing this dialog.")));
					sendingStatus.hidden = true;
					showError(message);
					const contextKeys = composerServices.add(this.contextKeyService.createScoped(composer));
					ChatContextKeys.location.bindTo(contextKeys).set(ChatAgentLocation.Chat);
					ChatContextKeys.inChatSession.bindTo(contextKeys).set(true);
					const usesCombinedConfigPicker = SessionUsesCombinedConfigPickerContext.bindTo(contextKeys);
					const sessionTypesChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessionTypes);
					composerServices.add(autorun(reader => {
						sessionTypesChanged.read(reader);
						const active = session.read(reader);
						contextKeys.bufferChangeEvents(() => {
							setActiveSessionContextKeys(active, contextKeys, reader);
							usesCombinedConfigPicker.set(!!active && this.sessionsManagementService.usesCombinedNewSessionConfigPicker(active));
						});
					}));
					const composerService = composerServices.add(new NewSessionComposerService());
					const instantiation = composerServices.add(this.instantiationService.createChild(new ServiceCollection(
						[IContextKeyService, contextKeys],
						[INewSessionComposerService, composerService],
					)));
					widget = instantiation.createInstance(NewChatWidget, { host });
					widget.render(composer);
					const layout = () => {
						if (composer && !closed) {
							widget?.layout(composer.clientHeight, composer.clientWidth);
						}
					};
					const observer = new targetWindow.ResizeObserver(layout);
					observer.observe(composer);
					store.add(toDisposable(() => observer.disconnect()));
				},
			}, this.keybindingService, this.layoutService, this.hostService, sessionDialogAllowableCommands)));
			const showing = dialog.show();
			widget?.focusInput();
			await showing;
			return closeWithResult ? submittedSession : undefined;
		} finally {
			this._store.delete(store);
		}
	}
}
