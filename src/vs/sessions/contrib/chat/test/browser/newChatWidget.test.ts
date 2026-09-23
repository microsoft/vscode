/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISession, ISessionWorkspace, SESSION_WORKSPACE_GROUP_GITHUB } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ICreateNewSessionOptions, WorkspaceNotTrustedError } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISendRequestOptions, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { IOpenNewSessionOptions, IOpenNewSessionResult } from '../../../../services/sessions/browser/sessionsService.js';
import { IPickedSessionType, IPreferredSessionType } from '../../browser/sessionTypePicker.js';
import { NewChatWidget } from '../../browser/newChatWidget.js';
import { SessionInputPickerVisibility } from '../../../../services/sessions/common/sessionPickerVisibility.js';
import { IChatRequestVariableEntry, toFileVariableEntry, toPasteVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getAdditionalFolderContextId, getAdditionalRepositoryContextId } from '../../common/newChatContextIds.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { IWorkspacePickerNoWorkspaceOption, WorkspacePicker } from '../../browser/sessionWorkspacePicker.js';
import { IWorkspaceSelectionSnapshot, WorkspaceSelectionOrigin } from '../../../../common/workspaceSelection.js';
import { ISelectWorkspaceOptions } from '../../../../browser/parts/chatView.js';
import { NewChatInputWidget } from '../../browser/newChatInput.js';
import { IChatDraft, serializeChatDraft } from '../../../../../workbench/contrib/chat/common/attachments/chatDraft.js';

/** The part of the active session `_recreateOnProviderChange` actually reads. */
interface IActiveDraft {
	readonly sessionId: string;
	readonly isCreated: IObservable<boolean>;
	readonly providerId: string;
	readonly sessionType: string;
}

interface IRecreateHarness {
	readonly _pendingPreferredUpgrade: MutableDisposable<IDisposable>;
	readonly _session: IObservable<IActiveDraft | undefined>;
	readonly _newChatInput: {
		readonly sessionTypePicker: {
			getPreferredSessionType(folderUri: URI): IPreferredSessionType | undefined;
		};
	};
	_isPreferredServable(folderUri: URI, pick: IPreferredSessionType): boolean;
	_createNewSession(folderUri: URI, userPick?: IPreferredSessionType): Promise<IOpenNewSessionResult>;
}

/** The collaborators `_createSessionNow` reads while assembling the `openNewSession` options. */
interface ICreateSessionNowHarness {
	readonly _newChatInput: {
		readonly sessionTypePicker: {
			getPreferredSessionType(folderUri: URI): IPreferredSessionType | undefined;
		};
	};
	readonly _workspacePicker: { readonly selectedResolved: { readonly providerId: string } | undefined };
	readonly sessionsService: { openNewSession(options: IOpenNewSessionOptions, token: CancellationToken): Promise<IOpenNewSessionResult> };
	readonly logService: { error(message: string, ...args: unknown[]): void };
	_isPreferredServable(folderUri: URI, pick: IPreferredSessionType): boolean;
}

interface INewChatWidgetHarness extends IRecreateHarness {
	readonly _newSessionCreation: MutableDisposable<IDisposable>;
	_pendingWorkspaceCreation?: Promise<IOpenNewSessionResult>;
	_createdSessionId: string | undefined;
	readonly sessionsManagementService: { readonly onDidChangeSessionTypes: Event<void> };
	readonly _newChatInput: {
		readonly sessionTypePicker: {
			getUserPickedSessionType(): IPreferredSessionType | undefined;
			getPreferredSessionType(folderUri: URI): IPreferredSessionType | undefined;
		};
	};
	_createSessionNow(folderUri: URI, userPick: IPreferredSessionType | undefined, token: CancellationToken): Promise<IOpenNewSessionResult>;
	_applyPreferredDevContainer(session: ISession | undefined, folderUri: URI): void;
	_scheduleRecreateOnProviderChange(folderUri: URI, userPick: IPreferredSessionType | undefined, created: ISession | undefined, replayMissedChange: boolean): void;
	_recreateOnProviderChange(folderUri: URI, userPick: IPreferredSessionType | undefined, created: ISession | undefined): void;
}

const createNewSession = Reflect.get(NewChatWidget.prototype, '_createNewSession') as (
	this: INewChatWidgetHarness,
	folderUri: URI,
	userPick?: IPreferredSessionType,
	handoff?: { readonly token: CancellationToken; readonly providerId?: string; readonly preferDevContainer?: boolean },
) => Promise<IOpenNewSessionResult>;
const createSessionNow = Reflect.get(NewChatWidget.prototype, '_createSessionNow') as (
	this: ICreateSessionNowHarness,
	folderUri: URI,
	userPick: IPreferredSessionType | undefined,
	token: CancellationToken,
) => Promise<IOpenNewSessionResult>;
const canApplyWorkspaceDefault = Reflect.get(NewChatWidget.prototype, '_canApplyWorkspaceDefault') as (this: NewChatWidget) => boolean;
const isPreferredServable = Reflect.get(NewChatWidget.prototype, '_isPreferredServable') as (
	this: {
		readonly agentHostFilterService: { readonly selectedHost: { readonly sessionCreationProviderId: string } };
		readonly sessionsManagementService: { getSessionTypesForFolder(folderUri: URI): readonly { readonly providerId: string; readonly sessionType: { readonly id: string } }[] };
	},
	folderUri: URI,
	pick: IPreferredSessionType,
) => boolean;
const prepareSessionTypeSelection = Reflect.get(NewChatWidget.prototype, '_prepareSessionTypeSelection') as (
	this: {
		readonly _workspacePicker: {
			readonly selectedFolderUri: URI | undefined;
			readonly selectedResolved: { readonly workspace: ISessionWorkspace } | undefined;
			setSelectedWorkspace(folderUri: URI, options: { fireEvent: false; providerId: string }): void;
		};
		readonly commandService: { executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> };
		readonly logService: { error(message: string): void };
		_isPreferredServable(folderUri: URI, pick: IPreferredSessionType): boolean;
	},
	pick: IPickedSessionType,
) => Promise<boolean>;
const applyPreferredDevContainer = Reflect.get(NewChatWidget.prototype, '_applyPreferredDevContainer') as (
	this: {
		_preferredDevContainerFolderUri: URI | undefined;
		readonly uriIdentityService: { readonly extUri: typeof extUri };
		readonly sessionsProvidersService: {
			getProvider(providerId: string): { readonly id: string; preferDevContainer?(sessionId: string): void } | undefined;
		};
	},
	session: ISession | undefined,
	folderUri: URI,
) => void;
const syncWorkspacePickerDevContainerMode = Reflect.get(NewChatWidget.prototype, '_syncWorkspacePickerDevContainerMode') as (
	this: {
		readonly sessionsProvidersService: {
			getProvider(providerId: string): { readonly id: string; isDevContainerEnabled?(sessionId: string): boolean } | undefined;
		};
		readonly _workspacePicker: {
			setSelectedWorkspace(folderUri: URI, options: { fireEvent: boolean; providerId: string; persist: boolean; preferDevContainer: boolean; origin: WorkspaceSelectionOrigin }): void;
		};
	},
	activeSession: IActiveSession,
	persist: boolean,
	origin: WorkspaceSelectionOrigin,
) => URI | undefined;
const scheduleRecreateOnProviderChange = Reflect.get(NewChatWidget.prototype, '_scheduleRecreateOnProviderChange') as INewChatWidgetHarness['_scheduleRecreateOnProviderChange'];
const recreateOnProviderChange = Reflect.get(NewChatWidget.prototype, '_recreateOnProviderChange') as (
	this: IRecreateHarness,
	folderUri: URI,
	userPick: IPreferredSessionType | undefined,
	created: { readonly sessionId: string } | undefined,
) => void;
const handlePromptOptionsWorkspaceChange = Reflect.get(NewChatWidget.prototype, '_handlePromptOptionsWorkspaceChange') as (this: IPromptOptionsWorkspaceHarness, previousFolderUri: URI | undefined, folderUri: URI | undefined) => void;
const syncWorkspacePickerFromSessionWorkspace = Reflect.get(NewChatWidget.prototype, '_syncWorkspacePickerFromSessionWorkspace') as (this: ISyncWorkspacePickerHarness, workspace: ISessionWorkspace | undefined) => void;
const hasEnoughSessionsForFirstRunNotices = Reflect.get(NewChatWidget.prototype, '_hasEnoughSessionsForFirstRunNotices') as (this: ISessionCountHarness) => boolean;
const send = Reflect.get(NewChatWidget.prototype, '_send') as (this: ISendHarness, query: string, attachedContext?: IChatRequestVariableEntry[], background?: boolean) => Promise<boolean>;

interface IPromptOptionsWorkspaceHarness {
	readonly uriIdentityService: { readonly extUri: typeof extUri };
	readonly _newChatInput: { clearPromptOptions(): void };
	_refreshPromptOptions(): Promise<void>;
}

interface ISyncWorkspacePickerHarness {
	readonly _workspacePicker: {
		matchesSelectedWorkspace(workspace: ISessionWorkspace): boolean;
		setSelectedWorkspace(folderUri: URI, options: { fireEvent: false; origin: WorkspaceSelectionOrigin }): void;
	};
}

interface ISessionCountHarness {
	readonly storageService: { getNumber(key: string, scope: unknown, defaultValue: number): number };
}

interface ISendHarness {
	readonly notificationService: { error(message: string): void };
	readonly _pendingBackgroundSends: { deleteAndDispose(key: object): void };
	readonly newSessionComposerService: { notifyWillSendRequest(options: ISendRequestOptions, selection: IWorkspaceSelectionSnapshot | undefined): void };
	readonly _session: IObservable<ISession | undefined>;
	readonly _feedbackItems: IObservable<readonly never[]>;
	readonly _workspacePicker: {
		readonly selectedFolderUri: URI | undefined;
		readonly selectionSnapshot?: IWorkspaceSelectionSnapshot;
		clearAttachedContext(): void;
		showPicker(): void;
	};
	readonly _isQuickChatComposer: IObservable<boolean>;
	readonly agentFeedbackService: { removeFeedback(resource: URI, id: string): void };
	readonly sessionsManagementService: { sendNewChatRequest(session: ISession, options: ISendRequestOptions): Promise<void> };
	readonly logService: { error(message: string, ...args: unknown[]): void };
	_getWorkspaceRoots(session: ISession): readonly URI[];
}

interface IRenderSessionTypePickerHarness {
	readonly _newChatInput: {
		readonly sessionTypePicker: {
			render(container: HTMLElement, options?: { className?: string }): void;
		};
	};
}

interface IRenderWorkspacePickerHarness extends IRenderSessionTypePickerHarness {
	readonly agentHostFilterService: { readonly selectedHost: { readonly sessionCreationProviderId: string } };
	readonly _newChatInput: IRenderSessionTypePickerHarness['_newChatInput'] & {
		readonly pickerVisibility: SessionInputPickerVisibility;
		placeRepositoryControls(container?: HTMLElement): void;
	};
	readonly _workspacePicker: {
		renderCategoryTriggers(container: HTMLElement, triggers: readonly { readonly label?: string; readonly tooltip?: string; readonly icon?: { readonly id: string }; readonly attachesContext?: boolean }[]): HTMLElement;
	};
	_renderSessionTypePicker(container: HTMLElement, isQuickChat: boolean): void;
	_workspacePickerRow: HTMLElement | undefined;
}

interface ISelectNoWorkspaceHarness {
	readonly _pendingPreferredUpgrade: MutableDisposable<IDisposable>;
	readonly _newSessionCreation: MutableDisposable<IDisposable>;
	readonly _workspacePicker: { selectNoWorkspace(): void };
	readonly sessionsService: { openQuickChat(options?: ICreateNewSessionOptions): { readonly sessionId: string } };
	_openQuickChat(options?: ICreateNewSessionOptions): { readonly sessionId: string } | undefined;
}

interface INoWorkspaceOptionHarness {
	readonly _useConsolidatedRemoteWorkspaces: IObservable<boolean>;
	readonly _isWorkspacePickerQuickChat: IObservable<boolean>;
	readonly _session: IObservable<{ readonly providerId: string } | undefined>;
	readonly sessionsProvidersService: { getProviders(): ISessionsProvider[] };
	readonly sessionsManagementService: { isQuickChatTargetAvailable(options?: ICreateNewSessionOptions): boolean };
	selectNoWorkspace(options?: ICreateNewSessionOptions): void;
}

interface IWorkspaceRootsHarness {
	readonly _isQuickChatComposer: IObservable<boolean>;
	readonly _workspacePicker: { readonly selectedFolderUri: URI | undefined };
}

interface IRestoreNoWorkspaceDraftHarness {
	readonly _session: IObservable<IActiveSession | undefined>;
	readonly _workspacePicker: { isNoWorkspaceSelected(): boolean };
	readonly sessionsManagementService: { isQuickChatTargetAvailable(): boolean };
	selectNoWorkspace(): void;
}

const renderWorkspacePicker = Reflect.get(NewChatWidget.prototype, '_renderWorkspacePicker') as (this: IRenderWorkspacePickerHarness, container: HTMLElement) => IDisposable;
const renderSessionTypePicker = Reflect.get(NewChatWidget.prototype, '_renderSessionTypePicker') as (this: IRenderSessionTypePickerHarness, container: HTMLElement, isQuickChat: boolean) => void;
const selectNoWorkspace = NewChatWidget.prototype.selectNoWorkspace as (this: ISelectNoWorkspaceHarness, options?: ICreateNewSessionOptions) => void;
const openQuickChat = Reflect.get(NewChatWidget.prototype, '_openQuickChat') as ISelectNoWorkspaceHarness['_openQuickChat'];
const getNoWorkspaceOption = Reflect.get(NewChatWidget.prototype, '_getNoWorkspaceOption') as (this: INoWorkspaceOptionHarness) => IWorkspacePickerNoWorkspaceOption | undefined;
const getWorkspaceRoots = Reflect.get(NewChatWidget.prototype, '_getWorkspaceRoots') as (this: IWorkspaceRootsHarness, session: ISession) => readonly URI[];
const restoreNoWorkspaceDraft = Reflect.get(NewChatWidget.prototype, '_restoreNoWorkspaceDraft') as (this: IRestoreNoWorkspaceDraftHarness) => boolean;

function createHarness(
	pendingPreferredUpgrade: MutableDisposable<IDisposable>,
	newSessionCreation: MutableDisposable<IDisposable>,
	onDidChangeSessionTypes: Event<void>,
	stubCreateSessionNow: (token: CancellationToken) => Promise<IOpenNewSessionResult>,
): INewChatWidgetHarness {
	const harness: INewChatWidgetHarness = {
		_pendingPreferredUpgrade: pendingPreferredUpgrade,
		_newSessionCreation: newSessionCreation,
		_createdSessionId: undefined,
		sessionsManagementService: { onDidChangeSessionTypes },
		_session: observableValue<IActiveDraft | undefined>('session', undefined),
		_newChatInput: {
			sessionTypePicker: {
				getUserPickedSessionType: () => undefined,
				getPreferredSessionType: () => undefined,
			},
		},
		_isPreferredServable: () => false,
		_createSessionNow: (_folderUri, _userPick, token) => stubCreateSessionNow(token),
		_applyPreferredDevContainer: () => { },
		_createNewSession: (folderUri, userPick) => createNewSession.call(harness, folderUri, userPick),
		_scheduleRecreateOnProviderChange: (folderUri, userPick, created, replayMissedChange) => scheduleRecreateOnProviderChange.call(harness, folderUri, userPick, created, replayMissedChange),
		_recreateOnProviderChange: (folderUri, userPick, created) => recreateOnProviderChange.call(harness, folderUri, userPick, created),
	};
	return harness;
}

suite('NewChatWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('workspace row hosts the workspace picker before the multiple-harness and context pickers', () => {
		const container = document.createElement('div');
		const harnessLabels = ['Copilot', 'Claude'];
		const workspaceTriggers: { readonly tooltip: string | undefined; readonly icon: string | undefined; readonly attachesContext: boolean | undefined }[] = [];
		const pickerVisibility = disposables.add(new SessionInputPickerVisibility());
		const workspaceVisibility: boolean[] = [];
		const harness: IRenderWorkspacePickerHarness = {
			agentHostFilterService: { selectedHost: { sessionCreationProviderId: 'creation' } },
			_workspacePicker: {
				renderCategoryTriggers: (target, triggers) => {
					workspaceVisibility.push(pickerVisibility.visibility.get().workspace);
					const row = document.createElement('div');
					target.appendChild(row);
					for (const trigger of triggers) {
						const item = document.createElement('div');
						item.textContent = trigger.label ?? 'More';
						row.appendChild(item);
						workspaceTriggers.push({ tooltip: trigger.tooltip, icon: trigger.icon?.id, attachesContext: trigger.attachesContext });
					}
					return row;
				},
			},
			_newChatInput: {
				pickerVisibility,
				placeRepositoryControls: () => { },
				sessionTypePicker: {
					render: (target, options) => {
						if (harnessLabels.length <= 1) {
							return;
						}
						const item = document.createElement('div');
						item.className = options?.className ?? '';
						item.textContent = harnessLabels[0];
						target.appendChild(item);
					},
				},
			},
			_renderSessionTypePicker: (target, isQuickChat) => renderSessionTypePicker.call(harness, target, isQuickChat),
			_workspacePickerRow: undefined,
		};

		disposables.add(renderWorkspacePicker.call(harness, container));
		workspaceVisibility.push(pickerVisibility.visibility.get().workspace);

		assert.deepStrictEqual({
			items: Array.from(harness._workspacePickerRow?.children ?? [], element => ({
				label: element.textContent,
				className: element.className,
			})),
			workspaceTriggers,
			workspaceVisibility,
		}, {
			items: [
				{ label: isWeb ? 'Select Repository' : 'Workspace', className: '' },
				{ label: '', className: 'new-chat-repository-controls-host' },
				{ label: 'Copilot', className: 'sessions-chat-session-type-picker sessions-workspace-category-picker-slot' },
			],
			workspaceTriggers: [{ tooltip: 'Choose where the new session runs', icon: isWeb ? 'repo' : 'project', attachesContext: false }],
			workspaceVisibility: [false, true],
		});
	});

	test('restores workspace, harness, context DOM and tab order after quick chat', () => {
		const workspaceRow = document.createElement('div');
		const quickChatHeader = document.createElement('div');
		for (const label of ['Workspace', 'Issue/PR']) {
			const item = document.createElement('a');
			item.tabIndex = 0;
			item.textContent = label;
			workspaceRow.appendChild(item);
		}
		let renderedPicker: HTMLElement | undefined;
		const harness: IRenderSessionTypePickerHarness = {
			_newChatInput: {
				sessionTypePicker: {
					render: (target, options) => {
						renderedPicker?.remove();
						const item = document.createElement('a');
						item.tabIndex = 0;
						item.className = options?.className ?? '';
						item.textContent = 'Copilot';
						target.appendChild(item);
						renderedPicker = item;
					},
				},
			},
		};

		const isQuickChat = observableValue('isQuickChat', false);
		disposables.add(autorun(reader => {
			const value = isQuickChat.read(reader);
			renderSessionTypePicker.call(harness, value ? quickChatHeader : workspaceRow, value);
		}));
		isQuickChat.set(true, undefined);
		isQuickChat.set(false, undefined);

		assert.deepStrictEqual({
			domOrder: Array.from(workspaceRow.children, element => element.textContent),
			tabOrder: Array.from(workspaceRow.querySelectorAll<HTMLElement>('[tabindex="0"]'), element => element.textContent),
			quickChatHeader: Array.from(quickChatHeader.children, element => element.textContent),
		}, {
			domOrder: ['Workspace', 'Copilot', 'Issue/PR'],
			tabOrder: ['Workspace', 'Copilot', 'Issue/PR'],
			quickChatHeader: [],
		});
	});

	test('selecting No workspace cancels pending workspace creation', () => {
		let pendingUpgradeDisposed = false;
		let sessionCreationDisposed = false;
		let quickChatOpenCount = 0;
		let quickChatOptions: ICreateNewSessionOptions | undefined;
		let noWorkspaceSelectCount = 0;
		const pendingPreferredUpgrade = disposables.add(new MutableDisposable<IDisposable>());
		const newSessionCreation = disposables.add(new MutableDisposable<IDisposable>());
		pendingPreferredUpgrade.value = toDisposable(() => pendingUpgradeDisposed = true);
		newSessionCreation.value = toDisposable(() => sessionCreationDisposed = true);

		const harness: ISelectNoWorkspaceHarness = {
			_pendingPreferredUpgrade: pendingPreferredUpgrade,
			_newSessionCreation: newSessionCreation,
			_workspacePicker: { selectNoWorkspace: () => noWorkspaceSelectCount++ },
			sessionsService: {
				openQuickChat: options => {
					quickChatOpenCount++;
					quickChatOptions = options;
					return { sessionId: 'quick-chat' };
				},
			},
			_openQuickChat: options => openQuickChat.call(harness, options),
		};
		selectNoWorkspace.call(harness, { providerId: 'agenthost-remote-test' });

		assert.deepStrictEqual({
			pendingUpgradeDisposed,
			sessionCreationDisposed,
			noWorkspaceSelectCount,
			quickChatOpenCount,
			quickChatOptions,
		}, {
			pendingUpgradeDisposed: true,
			sessionCreationDisposed: true,
			noWorkspaceSelectCount: 1,
			quickChatOpenCount: 1,
			quickChatOptions: { providerId: 'agenthost-remote-test' },
		});
	});

	test('restores a pending No workspace selection when quick chats become available', () => {
		let quickChatAvailable = false;
		let selectNoWorkspaceCalls = 0;
		const harness: IRestoreNoWorkspaceDraftHarness = {
			_session: constObservable(undefined),
			_workspacePicker: { isNoWorkspaceSelected: () => true },
			sessionsManagementService: { isQuickChatTargetAvailable: () => quickChatAvailable },
			selectNoWorkspace: () => selectNoWorkspaceCalls++,
		};

		const pending = restoreNoWorkspaceDraft.call(harness);
		quickChatAvailable = true;
		const restored = restoreNoWorkspaceDraft.call(harness);

		assert.deepStrictEqual({
			pending,
			restored,
			selectNoWorkspaceCalls,
		}, {
			pending: true,
			restored: true,
			selectNoWorkspaceCalls: 1,
		});
	});

	test('offers No workspace only when enabled and quick chats are available', () => {
		const cases = [
			{ enabled: false, available: true, isWorkspacePickerQuickChat: false },
			{ enabled: true, available: false, isWorkspacePickerQuickChat: false },
			{ enabled: true, available: true, isWorkspacePickerQuickChat: false },
			{ enabled: true, available: false, isWorkspacePickerQuickChat: true },
		];

		const options = cases.map(testCase => {
			const option = getNoWorkspaceOption.call({
				_useConsolidatedRemoteWorkspaces: constObservable(testCase.enabled),
				_isWorkspacePickerQuickChat: constObservable(testCase.isWorkspacePickerQuickChat),
				_session: constObservable(undefined),
				sessionsProvidersService: { getProviders: () => [] },
				sessionsManagementService: { isQuickChatTargetAvailable: () => testCase.available },
				selectNoWorkspace: () => { },
			});
			return option && { description: option.description, isSelected: option.isSelected };
		});

		assert.deepStrictEqual(options, isWeb
			? [undefined, undefined, undefined, undefined]
			: [
				undefined,
				undefined,
				{ description: 'Start without a backing workspace', isSelected: false },
				{ description: 'Start without a backing workspace', isSelected: true },
			]);
	});

	test('offers quick chat providers as a host submenu and forwards the selection', async () => {
		const selections: Array<ICreateNewSessionOptions | undefined> = [];
		const providers = [
			upcastPartial<ISessionsProvider>({
				id: LOCAL_AGENT_HOST_PROVIDER_ID,
				label: 'Local Agent Host',
				icon: Codicon.vm,
				supportsQuickChats: true,
			}),
			upcastPartial<ISessionsProvider>({
				id: 'agenthost-remote-test',
				label: 'Test Remote',
				icon: Codicon.remote,
				supportsQuickChats: true,
			}),
		];
		const option = getNoWorkspaceOption.call({
			_useConsolidatedRemoteWorkspaces: constObservable(true),
			_isWorkspacePickerQuickChat: constObservable(false),
			_session: constObservable(undefined),
			sessionsProvidersService: { getProviders: () => providers },
			sessionsManagementService: { isQuickChatTargetAvailable: options => !options?.providerId || providers.some(provider => provider.id === options.providerId) },
			selectNoWorkspace: options => selections.push(options),
		});
		await option?.submenuActions?.[1].run();

		assert.deepStrictEqual({
			labels: option?.submenuActions?.map(action => action.label),
			icons: option?.submenuActions?.map(action => (action as { readonly icon?: { readonly id: string } }).icon?.id),
			selections,
		}, isWeb
			? {
				labels: undefined,
				icons: undefined,
				selections: [],
			}
			: {
				labels: ['Local', 'Test Remote'],
				icons: [Codicon.vm.id, Codicon.remote.id],
				selections: [{ providerId: 'agenthost-remote-test' }],
			});
	});

	test('labels selected remote quick chats with their provider', () => {
		const providers = [
			upcastPartial<ISessionsProvider>({
				id: LOCAL_AGENT_HOST_PROVIDER_ID,
				label: 'Local Agent Host',
				supportsQuickChats: true,
			}),
			upcastPartial<ISessionsProvider>({
				id: 'agenthost-remote-test',
				label: 'Test Remote',
				supportsQuickChats: true,
			}),
		];
		const selectedLabels = [
			LOCAL_AGENT_HOST_PROVIDER_ID,
			'agenthost-remote-test',
			'agenthost-missing',
		].map(providerId => getNoWorkspaceOption.call({
			_useConsolidatedRemoteWorkspaces: constObservable(true),
			_isWorkspacePickerQuickChat: constObservable(true),
			_session: constObservable({ providerId }),
			sessionsProvidersService: { getProviders: () => providers },
			sessionsManagementService: { isQuickChatTargetAvailable: () => true },
			selectNoWorkspace: () => { },
		})?.selectedLabel);

		assert.deepStrictEqual(selectedLabels, isWeb
			? [undefined, undefined, undefined]
			: [undefined, 'Chat [Test Remote]', undefined]);
	});

	test('selects the sole quick chat provider directly', () => {
		const selections: Array<ICreateNewSessionOptions | undefined> = [];
		const provider = upcastPartial<ISessionsProvider>({
			id: 'agenthost-remote-test',
			label: 'Test Remote',
			icon: Codicon.remote,
			supportsQuickChats: true,
		});
		const option = getNoWorkspaceOption.call({
			_useConsolidatedRemoteWorkspaces: constObservable(true),
			_isWorkspacePickerQuickChat: constObservable(false),
			_session: constObservable(undefined),
			sessionsProvidersService: { getProviders: () => [provider] },
			sessionsManagementService: { isQuickChatTargetAvailable: () => true },
			selectNoWorkspace: options => selections.push(options),
		});
		option?.select();

		assert.deepStrictEqual({
			hasSubmenu: !!option?.submenuActions,
			selections,
		}, {
			hasSubmenu: false,
			selections: isWeb ? [] : [{ providerId: 'agenthost-remote-test' }],
		});
	});

	test('includes remote quick chat hosts even when availability is still resolving', async () => {
		const providers = [
			upcastPartial<ISessionsProvider>({
				id: LOCAL_AGENT_HOST_PROVIDER_ID,
				label: 'Local Agent Host',
				icon: Codicon.vm,
				supportsQuickChats: true,
			}),
			upcastPartial<ISessionsProvider>({
				id: 'agenthost-remote-test',
				label: 'Test Remote',
				icon: Codicon.remote,
				supportsQuickChats: true,
			}),
		];
		const option = getNoWorkspaceOption.call({
			_useConsolidatedRemoteWorkspaces: constObservable(true),
			_isWorkspacePickerQuickChat: constObservable(false),
			_session: constObservable(undefined),
			sessionsProvidersService: { getProviders: () => providers },
			sessionsManagementService: {
				isQuickChatTargetAvailable: options => options?.providerId === LOCAL_AGENT_HOST_PROVIDER_ID,
			},
			selectNoWorkspace: () => { },
		});
		await option?.submenuActions?.[1].run();

		assert.deepStrictEqual(option?.submenuActions?.map(action => action.label), isWeb ? undefined : ['Local', 'Test Remote']);
	});

	test('workspace-less chats do not inherit the previous picker workspace', () => {
		const staleFolder = URI.file('/previous-workspace');
		const session = upcastPartial<ISession>({ workspace: constObservable(undefined) });

		assert.deepStrictEqual({
			quickChat: getWorkspaceRoots.call({
				_isQuickChatComposer: constObservable(true),
				_workspacePicker: { selectedFolderUri: staleFolder },
			}, session).map(uri => uri.toString()),
			workspaceDraft: getWorkspaceRoots.call({
				_isQuickChatComposer: constObservable(false),
				_workspacePicker: { selectedFolderUri: staleFolder },
			}, session).map(uri => uri.toString()),
		}, {
			quickChat: [],
			workspaceDraft: [staleFolder.toString()],
		});
	});

	test('replays a provider change that arrives while creating the draft', async () => {
		const sessionTypesChanged = disposables.add(new Emitter<void>());
		const pendingPreferredUpgrade = disposables.add(new MutableDisposable<IDisposable>());
		const newSessionCreation = disposables.add(new MutableDisposable<IDisposable>());
		const folder = URI.file('/project');
		const firstCreation = new DeferredPromise<IOpenNewSessionResult>();
		let createCount = 0;
		const harness = createHarness(pendingPreferredUpgrade, newSessionCreation, sessionTypesChanged.event, () => {
			createCount++;
			return createCount === 1
				? firstCreation.p
				: Promise.resolve({ session: undefined, trustDeclined: true });
		});

		const creating = harness._createNewSession(folder);
		sessionTypesChanged.fire();
		firstCreation.complete({ session: undefined, trustDeclined: false });
		await creating;

		assert.strictEqual(createCount, 2);
	});

	test('tracks pending workspace creation until trust and draft creation settle', async () => {
		const creation = new DeferredPromise<IOpenNewSessionResult>();
		const harness = createHarness(
			disposables.add(new MutableDisposable<IDisposable>()),
			disposables.add(new MutableDisposable<IDisposable>()),
			Event.None,
			() => creation.p,
		);
		const creating = harness._createNewSession(URI.file('/project'));
		const pending = harness._pendingWorkspaceCreation === creation.p;
		await creation.complete({ session: undefined, trustDeclined: true });
		await creating;
		assert.deepStrictEqual({ pending, settled: harness._pendingWorkspaceCreation }, { pending: true, settled: undefined });
	});

	test('a cancelled handoff does not retry creation or apply its pending Dev Container preference', async () => {
		const changed = disposables.add(new Emitter<void>());
		const creation = new DeferredPromise<IOpenNewSessionResult>();
		const cancellation = disposables.add(new CancellationTokenSource());
		let calls = 0;
		let preferences = 0;
		const harness = createHarness(
			disposables.add(new MutableDisposable<IDisposable>()),
			disposables.add(new MutableDisposable<IDisposable>()),
			changed.event,
			async () => { calls++; return creation.p; },
		);
		harness._applyPreferredDevContainer = () => { preferences++; };
		const opening = createNewSession.call(harness, URI.file('/source'), undefined, { token: cancellation.token, preferDevContainer: true });
		cancellation.cancel();
		await creation.complete({ session: undefined, trustDeclined: false });
		await opening;
		changed.fire();
		assert.deepStrictEqual({ calls, preferences, pending: harness._pendingWorkspaceCreation }, { calls: 1, preferences: 0, pending: undefined });
	});

	test('applies the Dev Container preference when a late provider creates the draft', async () => {
		const sessionTypesChanged = disposables.add(new Emitter<void>());
		const pendingPreferredUpgrade = disposables.add(new MutableDisposable<IDisposable>());
		const newSessionCreation = disposables.add(new MutableDisposable<IDisposable>());
		let createCount = 0;
		const applied: string[] = [];
		const session = upcastPartial<ISession>({ sessionId: 'draft', providerId: LOCAL_AGENT_HOST_PROVIDER_ID });
		const harness = createHarness(pendingPreferredUpgrade, newSessionCreation, sessionTypesChanged.event, async () => {
			createCount++;
			return { session: createCount === 1 ? undefined : session, trustDeclined: false };
		});
		harness._applyPreferredDevContainer = created => {
			if (created) {
				applied.push(created.sessionId);
			}
		};

		await harness._createNewSession(URI.file('/project'));
		const countBeforeChange = createCount;
		sessionTypesChanged.fire();
		await timeout(0);

		assert.deepStrictEqual({
			countBeforeChange,
			countAfterChange: createCount,
			applied,
		}, {
			countBeforeChange: 1,
			countAfterChange: 2,
			applied: ['draft'],
		});
	});

	test('applies the Dev Container preference after the composer creates the requested draft', async () => {
		const sessionTypesChanged = disposables.add(new Emitter<void>());
		const pendingPreferredUpgrade = disposables.add(new MutableDisposable<IDisposable>());
		const newSessionCreation = disposables.add(new MutableDisposable<IDisposable>());
		const folder = URI.file('/project');
		const session = upcastPartial<ISession>({ sessionId: 'draft', providerId: LOCAL_AGENT_HOST_PROVIDER_ID });
		const applied: Array<{ sessionId: string; folder: string }> = [];
		const harness = createHarness(pendingPreferredUpgrade, newSessionCreation, sessionTypesChanged.event, async () => ({
			session,
			trustDeclined: false,
		}));
		harness._applyPreferredDevContainer = (created, createdFolder) => {
			if (created) {
				applied.push({ sessionId: created.sessionId, folder: createdFolder.toString() });
			}
		};

		await harness._createNewSession(folder);

		assert.deepStrictEqual(applied, [{ sessionId: 'draft', folder: folder.toString() }]);
	});

	test('applies a pending Dev Container preference only to a matching Agent Host draft', () => {
		const folder = URI.file('/project');
		const preferred: string[] = [];
		const harness = {
			_preferredDevContainerFolderUri: folder,
			uriIdentityService: { extUri },
			sessionsProvidersService: {
				getProvider: (providerId: string) => providerId === LOCAL_AGENT_HOST_PROVIDER_ID
					? { id: providerId, preferDevContainer: (sessionId: string) => preferred.push(sessionId) }
					: { id: providerId },
			},
		};
		applyPreferredDevContainer.call(
			harness,
			upcastPartial<ISession>({ sessionId: 'other', providerId: 'other-provider' }),
			folder,
		);
		const pendingAfterOtherProvider = harness._preferredDevContainerFolderUri?.toString();
		applyPreferredDevContainer.call(
			harness,
			upcastPartial<ISession>({ sessionId: 'local', providerId: LOCAL_AGENT_HOST_PROVIDER_ID }),
			URI.file('/other-project'),
		);
		const pendingAfterOtherFolder = harness._preferredDevContainerFolderUri?.toString();
		applyPreferredDevContainer.call(
			harness,
			upcastPartial<ISession>({ sessionId: 'local', providerId: LOCAL_AGENT_HOST_PROVIDER_ID }),
			folder,
		);

		assert.deepStrictEqual({
			preferred,
			pendingAfterOtherProvider,
			pendingAfterOtherFolder,
			pendingAfterMatch: harness._preferredDevContainerFolderUri,
		}, {
			preferred: ['local'],
			pendingAfterOtherProvider: folder.toString(),
			pendingAfterOtherFolder: folder.toString(),
			pendingAfterMatch: undefined,
		});
	});

	test('resynchronizes Dev Container mode with the selection origin when updating and restoring a draft', () => {
		const folder = URI.file('/project');
		let enabled = true;
		const selections: Array<{ readonly folderUri: string; readonly providerId: string; readonly persist: boolean; readonly preferDevContainer: boolean; readonly origin: WorkspaceSelectionOrigin }> = [];
		const harness = {
			sessionsProvidersService: {
				getProvider: () => ({
					id: LOCAL_AGENT_HOST_PROVIDER_ID,
					isDevContainerEnabled: () => enabled,
				}),
			},
			_workspacePicker: {
				setSelectedWorkspace: (folderUri: URI, options: { providerId: string; persist: boolean; preferDevContainer: boolean; origin: WorkspaceSelectionOrigin }) => selections.push({
					folderUri: folderUri.toString(),
					providerId: options.providerId,
					persist: options.persist,
					preferDevContainer: options.preferDevContainer,
					origin: options.origin,
				}),
			},
		};
		const activeSession = upcastPartial<IActiveSession>({
			sessionId: 'draft',
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			workspace: constObservable<ISessionWorkspace | undefined>(upcastPartial<ISessionWorkspace>({
				uri: folder,
				label: 'project',
				folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }],
			})),
		});

		syncWorkspacePickerDevContainerMode.call(harness, activeSession, false, WorkspaceSelectionOrigin.SessionSync);
		enabled = false;
		syncWorkspacePickerDevContainerMode.call(harness, activeSession, false, WorkspaceSelectionOrigin.SessionSync);
		syncWorkspacePickerDevContainerMode.call(harness, activeSession, true, WorkspaceSelectionOrigin.RestoredDraft);

		assert.deepStrictEqual(selections, [
			{ folderUri: folder.toString(), providerId: LOCAL_AGENT_HOST_PROVIDER_ID, persist: false, preferDevContainer: true, origin: WorkspaceSelectionOrigin.SessionSync },
			{ folderUri: folder.toString(), providerId: LOCAL_AGENT_HOST_PROVIDER_ID, persist: false, preferDevContainer: false, origin: WorkspaceSelectionOrigin.SessionSync },
			{ folderUri: folder.toString(), providerId: LOCAL_AGENT_HOST_PROVIDER_ID, persist: true, preferDevContainer: false, origin: WorkspaceSelectionOrigin.RestoredDraft },
		]);
	});

	test('cancels an in-flight creation and keeps the newer draft ownership', async () => {
		const sessionTypesChanged = disposables.add(new Emitter<void>());
		const pendingPreferredUpgrade = disposables.add(new MutableDisposable<IDisposable>());
		const newSessionCreation = disposables.add(new MutableDisposable<IDisposable>());
		const firstCreation = new DeferredPromise<IOpenNewSessionResult>();
		const tokens: CancellationToken[] = [];
		const harness = createHarness(pendingPreferredUpgrade, newSessionCreation, sessionTypesChanged.event, token => {
			tokens.push(token);
			return tokens.length === 1
				? firstCreation.p
				: Promise.resolve({ session: upcastPartial<ISession>({ sessionId: 'second' }), trustDeclined: false });
		});

		const first = harness._createNewSession(URI.file('/first'));
		const second = harness._createNewSession(URI.file('/second'));
		const firstCancelledWhenSecondStarted = tokens[0].isCancellationRequested;
		firstCreation.complete({ session: upcastPartial<ISession>({ sessionId: 'first' }), trustDeclined: false });
		await Promise.all([first, second]);

		assert.deepStrictEqual({
			tokenCount: tokens.length, firstCancelledWhenSecondStarted, createdSessionId: harness._createdSessionId,
		}, {
			tokenCount: 2, firstCancelledWhenSecondStarted: true, createdSessionId: 'second',
		});
	});

	test('restricts saved harness preferences to the explicit creation destination on web', () => {
		const folder = URI.parse('github-remote-file://github/microsoft/vscode/HEAD');
		const picks = [
			{ providerId: 'cloud', sessionTypeId: 'cloud' },
			{ sessionTypeId: 'cloud' },
			{ providerId: 'creation', sessionTypeId: 'sandbox' },
		];

		assert.deepStrictEqual(picks.map(pick => isPreferredServable.call({
			agentHostFilterService: { selectedHost: { sessionCreationProviderId: 'creation' } },
			sessionsManagementService: {
				getSessionTypesForFolder: () => [
					{ providerId: 'cloud', sessionType: { id: 'cloud' } },
					{ providerId: 'creation', sessionType: { id: 'sandbox' } },
				],
			},
		}, folder, pick)), isWeb ? [false, false, true] : [true, true, true]);
	});

	test('sends the user pick to openNewSession, falling back to the preferred type', async () => {
		const folder = URI.file('/project');
		const userPick: IPreferredSessionType = { providerId: 'agent-host', sessionTypeId: 'claude' };
		const preferredType: IPreferredSessionType = { providerId: 'copilot', sessionTypeId: 'copilot-cli' };
		const cases: { pick: IPreferredSessionType | undefined; servable: boolean; preferred: IPreferredSessionType | undefined }[] = [
			{ pick: userPick, servable: true, preferred: preferredType },
			{ pick: userPick, servable: false, preferred: preferredType },
			{ pick: undefined, servable: true, preferred: preferredType },
			{ pick: undefined, servable: true, preferred: undefined },
		];

		const requested = await Promise.all(cases.map(async ({ pick, servable, preferred }) => {
			let options: IOpenNewSessionOptions | undefined;
			await createSessionNow.call({
				_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => preferred } },
				_workspacePicker: { selectedResolved: { providerId: 'workspace-provider' } },
				sessionsService: {
					openNewSession: async opts => {
						options = opts;
						return { session: undefined, trustDeclined: false };
					},
				},
				logService: { error: () => { } },
				_isPreferredServable: () => servable,
			}, folder, pick, CancellationToken.None);
			return { providerId: options?.providerId, sessionTypeId: options?.sessionTypeId, preserveNavigation: options?.preserveNavigation };
		}));

		assert.deepStrictEqual(requested, [
			{ providerId: 'agent-host', sessionTypeId: 'claude', preserveNavigation: true },
			{ providerId: 'copilot', sessionTypeId: 'copilot-cli', preserveNavigation: true },
			{ providerId: 'copilot', sessionTypeId: 'copilot-cli', preserveNavigation: true },
			{ providerId: 'workspace-provider', sessionTypeId: undefined, preserveNavigation: true },
		]);
	});

	test('clones a cloud repository only when switching to a local harness', async () => {
		const repository = URI.parse('github-remote-file://github/microsoft/vscode/HEAD');
		const localRepository = URI.file('/repos/vscode');
		const calls: { commandId: string; args: unknown[] }[] = [];
		const selections: { folderUri: string; providerId: string }[] = [];
		const pick = { providerId: 'local-agent-host', sessionTypeId: 'claude' };

		const prepared = await prepareSessionTypeSelection.call({
			_workspacePicker: {
				selectedFolderUri: repository,
				selectedResolved: {
					workspace: upcastPartial<ISessionWorkspace>({
						group: SESSION_WORKSPACE_GROUP_GITHUB,
					}),
				},
				setSelectedWorkspace: (folderUri, options) => selections.push({ folderUri: folderUri.toString(), providerId: options.providerId }),
			},
			commandService: {
				executeCommand: async <T>(commandId: string, ...args: unknown[]) => {
					calls.push({ commandId, args });
					return localRepository.fsPath as T;
				},
			},
			logService: { error: () => { } },
			_isPreferredServable: folderUri => folderUri.scheme === 'file',
		}, pick);

		assert.deepStrictEqual({
			prepared,
			calls,
			selections,
		}, {
			prepared: true,
			calls: [{
				commandId: 'git.clone',
				args: [
					'https://github.com/microsoft/vscode.git',
					undefined,
					{ postCloneAction: 'none', returnRepositoryPath: true },
				],
			}],
			selections: [{
				folderUri: localRepository.toString(),
				providerId: 'local-agent-host',
			}],
		});
	});

	test('creates the cloned repository draft with the explicitly selected harness', async () => {
		const pendingPreferredUpgrade = disposables.add(new MutableDisposable<IDisposable>());
		const newSessionCreation = disposables.add(new MutableDisposable<IDisposable>());
		const pick = { providerId: 'local-agent-host', sessionTypeId: 'copilot' };
		let receivedPick: IPreferredSessionType | undefined;
		const harness = createHarness(
			pendingPreferredUpgrade,
			newSessionCreation,
			Event.None,
			async () => ({ session: undefined, trustDeclined: true }),
		);
		harness._createSessionNow = async (_folderUri, userPick) => {
			receivedPick = userPick;
			return { session: undefined, trustDeclined: true };
		};

		await harness._createNewSession(URI.file('/repos/vscode'), pick);

		assert.deepStrictEqual(receivedPick, pick);
	});

	test('a provider change only recreates the draft when the pick differs from it', () => {
		const folder = URI.file('/project');
		const draft: IActiveDraft = { sessionId: 's1', isCreated: constObservable(false), providerId: 'agent-host', sessionType: 'claude' };
		const cases: { name: string; pick: IPreferredSessionType; servable: boolean }[] = [
			{ name: 'pick matches the draft', pick: { providerId: 'agent-host', sessionTypeId: 'claude' }, servable: true },
			{ name: 'pick names no provider, type matches', pick: { sessionTypeId: 'claude' }, servable: true },
			{ name: 'pick names another provider', pick: { providerId: 'other', sessionTypeId: 'claude' }, servable: true },
			{ name: 'pick names another type', pick: { providerId: 'agent-host', sessionTypeId: 'codex' }, servable: true },
			{ name: 'pick cannot be served yet', pick: { providerId: 'other', sessionTypeId: 'codex' }, servable: false },
		];

		const outcomes = cases.map(({ name, pick, servable }) => {
			let recreated = false;
			const watcher = disposables.add(new MutableDisposable<IDisposable>());
			watcher.value = toDisposable(() => { });
			recreateOnProviderChange.call({
				_pendingPreferredUpgrade: watcher,
				_session: constObservable(draft),
				_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => undefined } },
				_isPreferredServable: () => servable,
				_createNewSession: async () => {
					recreated = true;
					return { session: undefined, trustDeclined: false };
				},
			}, folder, pick, { sessionId: 's1' });
			return `${name}: ${recreated ? 'recreated' : watcher.value ? 'still watching' : 'settled'}`;
		});

		assert.deepStrictEqual(outcomes, [
			'pick matches the draft: settled',
			'pick names no provider, type matches: settled',
			'pick names another provider: recreated',
			'pick names another type: recreated',
			'pick cannot be served yet: still watching',
		]);
	});

	test('provider-change recreation preserves the selected harness', () => {
		const folder = URI.file('/project');
		const draft: IActiveDraft = { sessionId: 's1', isCreated: constObservable(false), providerId: 'cloud', sessionType: 'cloud' };
		const pick = { providerId: 'local-agent-host', sessionTypeId: 'copilot' };
		let recreatedWith: IPreferredSessionType | undefined;

		recreateOnProviderChange.call({
			_pendingPreferredUpgrade: disposables.add(new MutableDisposable<IDisposable>()),
			_session: constObservable(draft),
			_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => undefined } },
			_isPreferredServable: () => true,
			_createNewSession: async (_folderUri, userPick) => {
				recreatedWith = userPick;
				return { session: undefined, trustDeclined: false };
			},
		}, folder, pick, { sessionId: 's1' });

		assert.deepStrictEqual(recreatedWith, pick);
	});

	test('refreshes prompt options when the draft workspace changes', () => {
		const changes: string[] = [];
		const harness: IPromptOptionsWorkspaceHarness = {
			uriIdentityService: { extUri },
			_newChatInput: { clearPromptOptions: () => changes.push('cleared') },
			_refreshPromptOptions: async () => { changes.push('refreshed'); },
		};
		const first = URI.file('/first');
		const second = URI.file('/second');

		handlePromptOptionsWorkspaceChange.call(harness, first, second);
		handlePromptOptionsWorkspaceChange.call(harness, second, second);
		handlePromptOptionsWorkspaceChange.call(harness, second, undefined);
		handlePromptOptionsWorkspaceChange.call(harness, undefined, first);

		assert.deepStrictEqual(changes, ['refreshed', 'cleared', 'refreshed']);
	});

	test('preserves the selected local workspace when a cloud draft represents the same repository', () => {
		const localFolder = URI.file('/project');
		const cloudFolder = URI.parse('github-remote-file://github/owner/project/HEAD');
		const otherCloudFolder = URI.parse('github-remote-file://github/owner/other/HEAD');
		const selected: { folder: string; origin: WorkspaceSelectionOrigin }[] = [];
		const harness: ISyncWorkspacePickerHarness = {
			_workspacePicker: {
				matchesSelectedWorkspace: workspace => workspace.folders[0].root.toString() === cloudFolder.toString(),
				setSelectedWorkspace: (folderUri, options) => selected.push({ folder: folderUri.toString(), origin: options.origin }),
			},
		};
		const workspace = (root: URI): ISessionWorkspace => upcastPartial<ISessionWorkspace>({
			uri: root,
			folders: [{
				root,
				workingDirectory: root,
				name: root.path,
				description: undefined,
			}],
		});

		syncWorkspacePickerFromSessionWorkspace.call(harness, workspace(cloudFolder));
		syncWorkspacePickerFromSessionWorkspace.call(harness, workspace(otherCloudFolder));
		syncWorkspacePickerFromSessionWorkspace.call(harness, workspace(localFolder));

		assert.deepStrictEqual(selected, [
			{ folder: otherCloudFolder.toString(), origin: WorkspaceSelectionOrigin.SessionSync },
			{ folder: localFolder.toString(), origin: WorkspaceSelectionOrigin.SessionSync },
		]);
	});

	test('only allows first-run notices once the session count threshold is reached', () => {
		const eligibility = [0, 1, 2, 5].map(sessionCount => hasEnoughSessionsForFirstRunNotices.call({
			storageService: { getNumber: () => sessionCount },
		}));

		assert.deepStrictEqual(eligibility, [false, false, true, true]);
	});

	test('forwards every composer context pill to the first chat request', async () => {
		const primaryFolder = URI.file('/primary');
		const attachedFolder = URI.file('/additional');
		const session = upcastPartial<ISession>({
			workspace: constObservable({
				uri: primaryFolder,
				label: 'primary',
				icon: Codicon.folder,
				folders: [{
					root: primaryFolder,
					workingDirectory: primaryFolder,
					name: 'primary',
					description: undefined,
					gitRepository: undefined,
				}],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			}),
		});
		const composerAttachment = toFileVariableEntry(URI.file('/explicit-file'));
		const duplicateRepositoryAttachment = toPasteVariableEntry(
			'explicit repository context',
			'Explicit repository context',
			{ id: `github-context:https://github.com/microsoft/vscode` },
		);
		const repositoryRoot = URI.parse('vscode-vfs://github/microsoft/vscode/HEAD');
		const repositoryContext = upcastPartial<ISessionWorkspace>({
			uri: URI.parse('https://github.com/microsoft/vscode'),
			label: 'microsoft/vscode',
			icon: Codicon.repo,
			folders: [{
				root: repositoryRoot,
				workingDirectory: repositoryRoot,
				name: 'vscode',
				description: undefined,
			}],
		});
		const issueContext = upcastPartial<ISessionWorkspace>({
			uri: URI.parse('https://github.com/microsoft/vscode/issues/332805'),
			label: 'microsoft/vscode#332805',
			icon: Codicon.issues,
		});
		const attachedFolderContext: IChatRequestVariableEntry = {
			kind: 'directory',
			id: getAdditionalFolderContextId(attachedFolder),
			name: 'additional',
			value: attachedFolder,
		};
		const additionalRepositoryContext: IChatRequestVariableEntry = {
			kind: 'generic',
			id: getAdditionalRepositoryContextId(repositoryContext.uri),
			name: repositoryContext.label,
			value: repositoryRoot,
			icon: repositoryContext.icon,
		};
		const issueAttachment = toPasteVariableEntry(
			issueContext.label,
			`GitHub context: ${issueContext.uri.toString()}`,
			{ id: `github-context:${issueContext.uri.toString()}`, icon: issueContext.icon },
		);
		let sentOptions: ISendRequestOptions | undefined;
		let preparedOptions: ISendRequestOptions | undefined;
		let preparedSelection: IWorkspaceSelectionSnapshot | undefined;
		const stages: string[] = [];
		const selectionSnapshot: IWorkspaceSelectionSnapshot = {
			folderUri: primaryFolder, state: 'selected', origin: WorkspaceSelectionOrigin.WindowOpen,
			historyState: 'loaded', sessionFallbackState: 'idle', registeredProviderCount: 1,
		};
		let clearAttachedContextCount = 0;

		const result = await send.call({
			notificationService: { error: () => { } },
			_pendingBackgroundSends: { deleteAndDispose: () => { } },
			_session: constObservable(session),
			_feedbackItems: constObservable([]),
			_workspacePicker: {
				selectedFolderUri: primaryFolder,
				selectionSnapshot,
				clearAttachedContext: () => clearAttachedContextCount++,
				showPicker: () => { },
			},
			_isQuickChatComposer: constObservable(false),
			agentFeedbackService: { removeFeedback: () => { } },
			newSessionComposerService: {
				notifyWillSendRequest: (options, selection) => {
					stages.push('prepare');
					preparedOptions = options;
					preparedSelection = selection;
				}
			},
			sessionsManagementService: {
				sendNewChatRequest: async (_session, options) => {
					sentOptions = options;
					stages.push('send');
				},
			},
			logService: { error: () => { } },
			_getWorkspaceRoots: () => [primaryFolder],
		}, 'work across contexts', [
			composerAttachment,
			duplicateRepositoryAttachment,
			attachedFolderContext,
			additionalRepositoryContext,
			issueAttachment,
		]);

		assert.deepStrictEqual({
			result,
			stages,
			preparedExactOptions: preparedOptions === sentOptions,
			preparedExactSelection: preparedSelection === selectionSnapshot,
			clearAttachedContextCount,
			attachments: sentOptions?.attachedContext?.map(attachment => ({
				kind: attachment.kind,
				id: attachment.id,
				value: URI.isUri(attachment.value) ? attachment.value.toString() : attachment.value,
			})),
		}, {
			result: true,
			stages: ['prepare', 'send'],
			preparedExactOptions: true,
			preparedExactSelection: true,
			clearAttachedContextCount: 1,
			attachments: [
				{ kind: 'file', id: composerAttachment.id, value: URI.file('/explicit-file').toString() },
				{ kind: 'paste', id: duplicateRepositoryAttachment.id, value: duplicateRepositoryAttachment.value },
				{ kind: 'directory', id: attachedFolderContext.id, value: attachedFolder.toString() },
				{ kind: 'generic', id: additionalRepositoryContext.id, value: repositoryRoot.toString() },
				{ kind: 'paste', id: issueAttachment.id, value: issueAttachment.value },
			],
		});
	});

	test('opens the workspace picker without sending when no workspace is selected', async () => {
		let pickerOpenCount = 0;
		let sendCount = 0;

		const result = await send.call({
			notificationService: { error: () => { } },
			_pendingBackgroundSends: { deleteAndDispose: () => { } },
			_session: constObservable(undefined),
			_feedbackItems: constObservable([]),
			_workspacePicker: {
				selectedFolderUri: undefined,
				clearAttachedContext: () => { },
				showPicker: () => pickerOpenCount++,
			},
			_isQuickChatComposer: constObservable(false),
			agentFeedbackService: { removeFeedback: () => { } },
			newSessionComposerService: { notifyWillSendRequest: () => { } },
			sessionsManagementService: {
				sendNewChatRequest: async () => {
					sendCount++;
				},
			},
			logService: { error: () => { } },
			_getWorkspaceRoots: () => [],
		}, 'work across contexts');

		assert.deepStrictEqual({ result, pickerOpenCount, sendCount }, {
			result: false,
			pickerOpenCount: 1,
			sendCount: 0,
		});
	});

	test('reports setup failures without clearing context or notifying on cancellation', async () => {
		const notifications: string[] = [];
		const errors: unknown[] = [];
		let cleared = 0;
		const session = upcastPartial<ISession>({ sessionId: 'draft' });
		const results: boolean[] = [];
		for (const error of [new Error('Container build failed'), new CancellationError(), new WorkspaceNotTrustedError()]) {
			const harness: ISendHarness & { send: typeof send } = {
				send,
				notificationService: { error: message => notifications.push(message) },
				_pendingBackgroundSends: { deleteAndDispose: () => { } },
				_session: constObservable(session),
				_feedbackItems: constObservable([]),
				_workspacePicker: { selectedFolderUri: undefined, clearAttachedContext: () => cleared++, showPicker: () => { } },
				_isQuickChatComposer: constObservable(false),
				agentFeedbackService: { removeFeedback: () => { } },
				newSessionComposerService: { notifyWillSendRequest: () => { } },
				sessionsManagementService: { sendNewChatRequest: async () => { throw error; } },
				logService: { error: (_message, error) => errors.push(error) },
				_getWorkspaceRoots: () => [],
			};
			results.push(await harness.send('hello'));
		}
		assert.deepStrictEqual({ results, notifications, cleared, errors: errors.length }, {
			results: [false, false, false],
			notifications: ['Failed to start session: Container build failed'],
			cleared: 0,
			errors: 1,
		});
	});

	for (const origin of [
		WorkspaceSelectionOrigin.None, WorkspaceSelectionOrigin.CheckedWorkspace, WorkspaceSelectionOrigin.AgentsRecent,
		WorkspaceSelectionOrigin.VSCodeRecent, WorkspaceSelectionOrigin.VSCodeWorkspace, WorkspaceSelectionOrigin.ExistingSessions, WorkspaceSelectionOrigin.WindowContext,
		WorkspaceSelectionOrigin.User, WorkspaceSelectionOrigin.WindowOpen, WorkspaceSelectionOrigin.RestoredDraft,
		WorkspaceSelectionOrigin.SessionSync, WorkspaceSelectionOrigin.Programmatic,
	]) {
		test(`the target composer handles an inferred default over ${origin}`, () => {
			const folderUri = URI.file('/from-editor');
			let selection: IWorkspaceSelectionSnapshot = {
				folderUri: URI.file('/previous'), state: 'selected', origin,
				historyState: 'loaded', sessionFallbackState: 'idle', registeredProviderCount: 1,
			};
			const selected: URI[] = [];
			const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
				_newSessionCreation: disposables.add(new MutableDisposable<IDisposable>()),
				_newChatInput: { canApplyWorkspaceDefault: true },
				_isQuickChatComposer: constObservable(false),
				uriIdentityService: { extUri },
				_workspacePicker: {
					get selectionSnapshot() { return selection; },
					setSelectedWorkspace: (folder: URI) => {
						selected.push(folder);
						selection = { ...selection, folderUri: folder };
					},
				},
			});
			const preserved = [
				WorkspaceSelectionOrigin.User, WorkspaceSelectionOrigin.WindowOpen, WorkspaceSelectionOrigin.RestoredDraft,
				WorkspaceSelectionOrigin.SessionSync, WorkspaceSelectionOrigin.Programmatic,
			].includes(origin);
			assert.deepStrictEqual({ result: widget.selectWorkspace(folderUri, { isDefault: true }), selected }, {
				result: preserved ? 'preserved' : 'applied', selected: preserved ? [] : [folderUri],
			});
		});
	}

	for (const protectedState of ['input', 'attachments', 'restoredDraft', 'noWorkspace', 'quickChat'] as const) {
		test(`an inferred workspace preserves the target composer's ${protectedState}`, () => {
			const input: NewChatInputWidget = Object.assign(Object.create(NewChatInputWidget.prototype), {
				_editor: { getValue: () => protectedState === 'input' ? 'unsent input' : '' },
				_contextAttachments: { attachments: protectedState === 'attachments' ? [toFileVariableEntry(URI.file('/attached'))] : [] },
				options: { canApplyWorkspaceDefault: () => canApplyWorkspaceDefault.call(widget) },
			});
			const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
				_session: constObservable(protectedState === 'restoredDraft' ? upcastPartial<IActiveSession>({ sessionId: 'restored' }) : undefined),
				_newSessionCreation: disposables.add(new MutableDisposable<IDisposable>()),
				_newChatInput: input,
				_isQuickChatComposer: constObservable(protectedState === 'quickChat'),
				_workspacePicker: {
					selectionSnapshot: { state: protectedState === 'noWorkspace' ? 'noWorkspace' : 'none', origin: WorkspaceSelectionOrigin.None },
					setSelectedWorkspace: () => assert.fail('must preserve the composer'),
				},
			});
			assert.strictEqual(widget.selectWorkspace(URI.file('/default'), { isDefault: true }), 'preserved');
		});
	}

	for (const createdSessionId of [undefined, 'late-draft', 'another-draft']) {
		test(`checks late draft ownership before applying a default (created: ${createdSessionId})`, () => {
			const session = observableValue<IActiveSession | undefined>('session', undefined);
			const creation = disposables.add(new MutableDisposable<IDisposable>());
			const selected: URI[] = [];
			let selection: IWorkspaceSelectionSnapshot = {
				folderUri: undefined, state: 'none', origin: WorkspaceSelectionOrigin.None,
				historyState: 'loaded', sessionFallbackState: 'idle', registeredProviderCount: 1,
			};
			const input: NewChatInputWidget = Object.assign(Object.create(NewChatInputWidget.prototype), {
				_editor: { getValue: () => '' },
				_contextAttachments: { attachments: [] },
				options: { canApplyWorkspaceDefault: () => canApplyWorkspaceDefault.call(widget) },
			});
			const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
				_session: session,
				_createdSessionId: createdSessionId,
				_newSessionCreation: creation,
				_newChatInput: input,
				_isQuickChatComposer: constObservable(false),
				uriIdentityService: { extUri },
				_workspacePicker: {
					get selectionSnapshot() { return selection; },
					setSelectedWorkspace: (folderUri: URI) => {
						selected.push(folderUri);
						selection = { ...selection, state: 'selected', folderUri };
					},
				},
			});
			const initiallyEligible = input.canApplyWorkspaceDefault;
			session.set(upcastPartial<IActiveSession>({
				sessionId: 'late-draft', workspace: constObservable(undefined),
			}), undefined);
			creation.value = toDisposable(() => { });
			const folderUri = URI.file('/from-editor');
			const whileCreating = widget.selectWorkspace(folderUri, { isDefault: true });
			creation.clear();
			const result = widget.selectWorkspace(folderUri, { isDefault: true });
			const ownsDraft = createdSessionId === 'late-draft';
			assert.deepStrictEqual({ initiallyEligible, whileCreating, result, selected }, {
				initiallyEligible: true, whileCreating: 'notReady',
				result: ownsDraft ? 'applied' : 'preserved', selected: ownsDraft ? [folderUri] : [],
			});
		});
	}

	test('forwards Dev Container mode and selection origin while acknowledging only the resolved target folder', () => {
		const folder = URI.file('/requested');
		let selection: Pick<IWorkspaceSelectionSnapshot, 'folderUri' | 'state'> = { folderUri: folder, state: 'unresolved' };
		const forwarded: Parameters<WorkspacePicker['setSelectedWorkspace']>[1][] = [];
		const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
			uriIdentityService: { extUri },
			_workspacePicker: {
				get selectionSnapshot() { return selection; },
				setSelectedWorkspace: (_folder: URI, options: Parameters<WorkspacePicker['setSelectedWorkspace']>[1]) => forwarded.push(options),
			},
		});

		const options: ISelectWorkspaceOptions = { providerId: 'provider', preferDevContainer: true, selectionOrigin: WorkspaceSelectionOrigin.WindowOpen };
		const results = [widget.selectWorkspace(folder, options)];
		selection = { folderUri: URI.file('/unrelated'), state: 'selected' };
		results.push(widget.selectWorkspace(folder, options));
		selection = { folderUri: folder, state: 'selected' };
		results.push(widget.selectWorkspace(folder, options));
		assert.deepStrictEqual({ results, forwarded }, {
			results: ['notReady', 'notReady', 'applied'],
			forwarded: Array.from({ length: 3 }, () => ({ providerId: 'provider', preferDevContainer: true, origin: WorkspaceSelectionOrigin.WindowOpen })),
		});
	});

	for (const existing of ['empty', 'text', 'attachments', 'lateEdit', 'cancelled'] as const) {
		test(`draft handoff preserves ownership for ${existing} destination input`, async () => {
			const changed = disposables.add(new Emitter<void>());
			const cancellation = disposables.add(new CancellationTokenSource());
			const ready = new DeferredPromise<void>();
			const sourceFolder = URI.file('/source');
			const originalFolder = URI.file('/destination');
			let selectedFolder = originalFolder;
			let content: IChatDraft = {
				inputText: existing === 'text' ? 'Keep destination' : '',
				attachments: existing === 'attachments' ? [toFileVariableEntry(URI.file('/destination/context'))] : [],
			};
			let creations = 0;
			const incoming = { inputText: 'Incoming', attachments: [toFileVariableEntry(URI.file('/source/context'))] };
			const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
				_store: disposables.add(new DisposableStore()),
				_feedbackItems: constObservable([]),
				_newChatInput: {
					isInputReady: true,
					get hasInput() { return !!content.inputText || content.attachments.length > 0; },
					onDidChangeInput: changed.event,
					sessionTypePicker: { getUserPickedSessionType: () => undefined },
					applyDraft: (draft: IChatDraft) => { content = draft; return true; },
				},
				_createNewSession: async (_folder: URI, _pick: IPreferredSessionType | undefined, handoff: { token: CancellationToken }): Promise<IOpenNewSessionResult> => {
					await ready.p;
					if (handoff.token.isCancellationRequested) {
						return { session: undefined, trustDeclined: false };
					}
					creations++;
					return { session: upcastPartial<IActiveSession>({ providerId: 'source-provider' }), trustDeclined: false };
				},
				_workspacePicker: {
					selectionSnapshot: { state: 'selected', folderUri: originalFolder, origin: WorkspaceSelectionOrigin.User },
					setSelectedWorkspace: (folder: URI) => { selectedFolder = folder; },
				},
			});
			const opening = widget.applyDraft(serializeChatDraft(incoming), sourceFolder, {
				providerId: 'source-provider', selectionOrigin: WorkspaceSelectionOrigin.WindowOpen,
			}, cancellation.token);
			if (existing === 'lateEdit') {
				content = { inputText: 'Typed while workspace trust was pending', attachments: [] };
				changed.fire();
			} else if (existing === 'cancelled') {
				cancellation.cancel();
			}
			await ready.complete();
			const result = await opening;
			assert.deepStrictEqual({
				result, selectedFolder, creations, content,
			}, {
				result: existing === 'empty' ? 'applied' : 'preserved',
				selectedFolder: existing === 'empty' ? sourceFolder : originalFolder,
				creations: existing === 'empty' ? 1 : 0,
				content: existing === 'empty' ? incoming : {
					inputText: existing === 'text' ? 'Keep destination' : existing === 'lateEdit' ? 'Typed while workspace trust was pending' : '',
					attachments: existing === 'attachments' ? [toFileVariableEntry(URI.file('/destination/context'))] : [],
				},
			});
		});
	}
});
