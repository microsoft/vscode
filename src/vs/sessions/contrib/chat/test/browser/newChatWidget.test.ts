/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ISendRequestOptions } from '../../../../services/sessions/common/sessionsProvider.js';
import { IOpenNewSessionOptions, IOpenNewSessionResult } from '../../../../services/sessions/browser/sessionsService.js';
import { IPreferredSessionType } from '../../browser/sessionTypePicker.js';
import { NewChatWidget } from '../../browser/newChatWidget.js';
import { IChatRequestVariableEntry, toFileVariableEntry, toPasteVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { Codicon } from '../../../../../base/common/codicons.js';

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
	_createNewSession(folderUri: URI): Promise<IOpenNewSessionResult>;
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
	readonly sessionsManagementService: { readonly onDidChangeSessionTypes: Event<void> };
	readonly _newChatInput: {
		readonly sessionTypePicker: {
			getUserPickedSessionType(): IPreferredSessionType | undefined;
			getPreferredSessionType(folderUri: URI): IPreferredSessionType | undefined;
		};
	};
	_createSessionNow(folderUri: URI, userPick: IPreferredSessionType | undefined, token: CancellationToken): Promise<IOpenNewSessionResult>;
	_scheduleRecreateOnProviderChange(folderUri: URI, userPick: IPreferredSessionType | undefined, created: ISession | undefined, replayMissedChange: boolean): void;
	_recreateOnProviderChange(folderUri: URI, userPick: IPreferredSessionType | undefined, created: ISession | undefined): void;
}

const createNewSession = Reflect.get(NewChatWidget.prototype, '_createNewSession') as (
	this: INewChatWidgetHarness,
	folderUri: URI,
) => Promise<IOpenNewSessionResult>;
const createSessionNow = Reflect.get(NewChatWidget.prototype, '_createSessionNow') as (
	this: ICreateSessionNowHarness,
	folderUri: URI,
	userPick: IPreferredSessionType | undefined,
	token: CancellationToken,
) => Promise<IOpenNewSessionResult>;
const scheduleRecreateOnProviderChange = Reflect.get(NewChatWidget.prototype, '_scheduleRecreateOnProviderChange') as INewChatWidgetHarness['_scheduleRecreateOnProviderChange'];
const recreateOnProviderChange = Reflect.get(NewChatWidget.prototype, '_recreateOnProviderChange') as (
	this: IRecreateHarness,
	folderUri: URI,
	userPick: IPreferredSessionType | undefined,
	created: { readonly sessionId: string } | undefined,
) => void;
const handlePromptOptionsWorkspaceChange = Reflect.get(NewChatWidget.prototype, '_handlePromptOptionsWorkspaceChange') as (this: IPromptOptionsWorkspaceHarness, previousFolderUri: URI | undefined, folderUri: URI | undefined) => void;
const hasEnoughSessionsForFirstRunNotices = Reflect.get(NewChatWidget.prototype, '_hasEnoughSessionsForFirstRunNotices') as (this: ISessionCountHarness) => boolean;
const send = Reflect.get(NewChatWidget.prototype, '_send') as (this: ISendHarness, query: string, attachedContext?: IChatRequestVariableEntry[], background?: boolean) => Promise<boolean>;

interface IPromptOptionsWorkspaceHarness {
	readonly uriIdentityService: { readonly extUri: typeof extUri };
	readonly _newChatInput: { clearPromptOptions(): void };
	_refreshPromptOptions(): Promise<void>;
}

interface ISessionCountHarness {
	readonly storageService: { getNumber(key: string, scope: unknown, defaultValue: number): number };
}

interface ISendHarness {
	readonly _session: IObservable<ISession | undefined>;
	readonly _feedbackItems: IObservable<readonly never[]>;
	readonly _workspacePicker: {
		readonly selectedFolderUri: URI | undefined;
		readonly additionalFolderUris: readonly URI[];
		readonly attachedContextWorkspaces: readonly ISessionWorkspace[];
		clearAttachedContext(): void;
		showPicker(): void;
	};
	readonly _isQuickChatComposer: IObservable<boolean>;
	readonly agentFeedbackService: { removeFeedback(resource: URI, id: string): void };
	readonly sessionsManagementService: { sendNewChatRequest(session: ISession, options: ISendRequestOptions): Promise<void> };
	readonly logService: { error(message: string, ...args: unknown[]): void };
}

function createHarness(
	pendingPreferredUpgrade: MutableDisposable<IDisposable>,
	newSessionCreation: MutableDisposable<IDisposable>,
	onDidChangeSessionTypes: Event<void>,
	stubCreateSessionNow: (token: CancellationToken) => Promise<IOpenNewSessionResult>,
): INewChatWidgetHarness {
	const harness: INewChatWidgetHarness = {
		_pendingPreferredUpgrade: pendingPreferredUpgrade,
		_newSessionCreation: newSessionCreation,
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
		_createNewSession: folderUri => createNewSession.call(harness, folderUri),
		_scheduleRecreateOnProviderChange: (folderUri, userPick, created, replayMissedChange) => scheduleRecreateOnProviderChange.call(harness, folderUri, userPick, created, replayMissedChange),
		_recreateOnProviderChange: (folderUri, userPick, created) => recreateOnProviderChange.call(harness, folderUri, userPick, created),
	};
	return harness;
}

suite('NewChatWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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

	test('waits for another provider change after creation fails', async () => {
		const sessionTypesChanged = disposables.add(new Emitter<void>());
		const pendingPreferredUpgrade = disposables.add(new MutableDisposable<IDisposable>());
		const newSessionCreation = disposables.add(new MutableDisposable<IDisposable>());
		let createCount = 0;
		const harness = createHarness(pendingPreferredUpgrade, newSessionCreation, sessionTypesChanged.event, async () => {
			createCount++;
			return { session: undefined, trustDeclined: false };
		});

		await harness._createNewSession(URI.file('/project'));
		const countBeforeChange = createCount;
		sessionTypesChanged.fire();

		assert.deepStrictEqual({ countBeforeChange, countAfterChange: createCount }, { countBeforeChange: 1, countAfterChange: 2 });
	});

	test('cancels an in-flight creation when a newer one starts', async () => {
		const sessionTypesChanged = disposables.add(new Emitter<void>());
		const pendingPreferredUpgrade = disposables.add(new MutableDisposable<IDisposable>());
		const newSessionCreation = disposables.add(new MutableDisposable<IDisposable>());
		const firstCreation = new DeferredPromise<IOpenNewSessionResult>();
		const tokens: CancellationToken[] = [];
		const harness = createHarness(pendingPreferredUpgrade, newSessionCreation, sessionTypesChanged.event, token => {
			tokens.push(token);
			return tokens.length === 1
				? firstCreation.p
				: Promise.resolve({ session: undefined, trustDeclined: true });
		});

		const first = harness._createNewSession(URI.file('/first'));
		const second = harness._createNewSession(URI.file('/second'));
		const firstCancelledWhenSecondStarted = tokens[0].isCancellationRequested;
		firstCreation.complete({ session: undefined, trustDeclined: false });
		await Promise.all([first, second]);

		assert.deepStrictEqual({ tokenCount: tokens.length, firstCancelledWhenSecondStarted }, { tokenCount: 2, firstCancelledWhenSecondStarted: true });
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
			return { providerId: options?.providerId, sessionTypeId: options?.sessionTypeId };
		}));

		assert.deepStrictEqual(requested, [
			{ providerId: 'agent-host', sessionTypeId: 'claude' },
			{ providerId: 'copilot', sessionTypeId: 'copilot-cli' },
			{ providerId: 'copilot', sessionTypeId: 'copilot-cli' },
			{ providerId: 'workspace-provider', sessionTypeId: undefined },
		]);
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

	test('only allows first-run notices once the session count threshold is reached', () => {
		const eligibility = [0, 1, 2, 5].map(sessionCount => hasEnoughSessionsForFirstRunNotices.call({
			storageService: { getNumber: () => sessionCount },
		}));

		assert.deepStrictEqual(eligibility, [false, false, true, true]);
	});

	test('forwards selected folder and GitHub attachments to the first chat request', async () => {
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
		const repositoryContext = upcastPartial<ISessionWorkspace>({
			uri: URI.parse('https://github.com/microsoft/vscode'),
			label: 'microsoft/vscode',
			icon: Codicon.repo,
		});
		const issueContext = upcastPartial<ISessionWorkspace>({
			uri: URI.parse('https://github.com/microsoft/vscode/issues/332805'),
			label: 'microsoft/vscode#332805',
			icon: Codicon.issues,
		});
		let sentOptions: ISendRequestOptions | undefined;
		let clearAttachedContextCount = 0;

		const result = await send.call({
			_session: constObservable(session),
			_feedbackItems: constObservable([]),
			_workspacePicker: {
				selectedFolderUri: primaryFolder,
				additionalFolderUris: [attachedFolder],
				attachedContextWorkspaces: [repositoryContext, issueContext],
				clearAttachedContext: () => clearAttachedContextCount++,
				showPicker: () => { },
			},
			_isQuickChatComposer: constObservable(false),
			agentFeedbackService: { removeFeedback: () => { } },
			sessionsManagementService: {
				sendNewChatRequest: async (_session, options) => {
					sentOptions = options;
				},
			},
			logService: { error: () => { } },
		}, 'work across contexts', [composerAttachment, duplicateRepositoryAttachment]);

		assert.deepStrictEqual({
			result,
			clearAttachedContextCount,
			attachments: sentOptions?.attachedContext?.map(attachment => ({
				kind: attachment.kind,
				id: attachment.id,
				value: URI.isUri(attachment.value) ? attachment.value.toString() : attachment.value,
			})),
		}, {
			result: true,
			clearAttachedContextCount: 1,
			attachments: [
				{ kind: 'file', id: composerAttachment.id, value: URI.file('/explicit-file').toString() },
				{ kind: 'paste', id: duplicateRepositoryAttachment.id, value: duplicateRepositoryAttachment.value },
				{ kind: 'directory', id: attachedFolder.toString(), value: attachedFolder.toString() },
				{ kind: 'paste', id: `github-context:${issueContext.uri.toString()}`, value: `GitHub context: ${issueContext.uri.toString()}` },
			],
		});
	});

	test('opens the workspace picker without sending when no workspace is selected', async () => {
		let pickerOpenCount = 0;
		let sendCount = 0;

		const result = await send.call({
			_session: constObservable(undefined),
			_feedbackItems: constObservable([]),
			_workspacePicker: {
				selectedFolderUri: undefined,
				additionalFolderUris: [],
				attachedContextWorkspaces: [],
				clearAttachedContext: () => { },
				showPicker: () => pickerOpenCount++,
			},
			_isQuickChatComposer: constObservable(false),
			agentFeedbackService: { removeFeedback: () => { } },
			sessionsManagementService: {
				sendNewChatRequest: async () => {
					sendCount++;
				},
			},
			logService: { error: () => { } },
		}, 'work across contexts');

		assert.deepStrictEqual({ result, pickerOpenCount, sendCount }, {
			result: false,
			pickerOpenCount: 1,
			sendCount: 0,
		});
	});

});
