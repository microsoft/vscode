/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { IOpenNewSessionResult } from '../../../../services/sessions/browser/sessionsService.js';
import { IPreferredSessionType } from '../../browser/sessionTypePicker.js';
import { NewChatWidget } from '../../browser/newChatWidget.js';

interface INewChatWidgetHarness {
	readonly _pendingPreferredUpgrade: MutableDisposable<IDisposable>;
	readonly _newSessionCreation: MutableDisposable<IDisposable>;
	readonly sessionsManagementService: { readonly onDidChangeSessionTypes: Event<void> };
	readonly _session: IObservable<IActiveSession | undefined>;
	readonly _newChatInput: {
		readonly sessionTypePicker: {
			getUserPickedSessionType(): IPreferredSessionType | undefined;
			getPreferredSessionType(folderUri: URI): IPreferredSessionType | undefined;
		};
	};
	_isPreferredServable(folderUri: URI, pick: IPreferredSessionType): boolean;
	_createSessionNow(folderUri: URI, userPick: IPreferredSessionType | undefined, token: CancellationToken): Promise<IOpenNewSessionResult>;
	_createNewSession(folderUri: URI): Promise<IOpenNewSessionResult>;
	_scheduleRecreateOnProviderChange(folderUri: URI, userPick: IPreferredSessionType | undefined, created: ISession | undefined, replayMissedChange: boolean): void;
	_recreateOnProviderChange(folderUri: URI, userPick: IPreferredSessionType | undefined, created: ISession | undefined): void;
}

const createNewSession = Reflect.get(NewChatWidget.prototype, '_createNewSession') as (
	this: INewChatWidgetHarness,
	folderUri: URI,
) => Promise<IOpenNewSessionResult>;
const scheduleRecreateOnProviderChange = Reflect.get(NewChatWidget.prototype, '_scheduleRecreateOnProviderChange') as INewChatWidgetHarness['_scheduleRecreateOnProviderChange'];
const recreateOnProviderChange = Reflect.get(NewChatWidget.prototype, '_recreateOnProviderChange') as INewChatWidgetHarness['_recreateOnProviderChange'];
const setInputOnboardingVisible = Reflect.get(NewChatWidget.prototype, 'setInputOnboardingVisible') as (this: IChatTipVisibilityHarness, visible: boolean) => void;
const setInputNotificationVisible = Reflect.get(NewChatWidget.prototype, 'setInputNotificationVisible') as (this: IChatTipVisibilityHarness, visible: boolean) => void;
const isInputOnboardingVisible = Reflect.get(NewChatWidget.prototype, 'isInputOnboardingVisible') as (this: IChatTipVisibilityHarness) => boolean;
const isChatTipSuppressed = Reflect.get(NewChatWidget.prototype, 'isChatTipSuppressed') as (this: IChatTipVisibilityHarness) => boolean;
const updateChatTipVisibility = Reflect.get(NewChatWidget.prototype, 'updateChatTipVisibility') as (this: IChatTipVisibilityHarness) => void;
const handlePromptOptionsWorkspaceChange = Reflect.get(NewChatWidget.prototype, '_handlePromptOptionsWorkspaceChange') as (this: IPromptOptionsWorkspaceHarness, previousFolderUri: URI | undefined, folderUri: URI | undefined) => void;

interface IChatTipVisibilityHarness {
	_isInputOnboardingVisible: boolean;
	_isInputNotificationVisible: boolean;
	storageService: { getNumber(key: string, scope: unknown, defaultValue: number): number };
	isInputOnboardingVisible(): boolean;
	isChatTipSuppressed(): boolean;
	updateChatTipVisibility(): void;
	_clearChatTip(): void;
	_renderChatTip(): void;
}

interface IPromptOptionsWorkspaceHarness {
	readonly uriIdentityService: { readonly extUri: typeof extUri };
	readonly _newChatInput: { clearPromptOptions(): void };
	_refreshPromptOptions(): Promise<void>;
}

function createChatTipVisibilityHarness(visibilityChanges: string[], storageValues: Map<string, number> = new Map()): IChatTipVisibilityHarness {
	const harness: IChatTipVisibilityHarness = {
		_isInputOnboardingVisible: false,
		_isInputNotificationVisible: false,
		storageService: {
			getNumber: (key: string, _scope: unknown, defaultValue: number) => storageValues.get(key) ?? defaultValue,
		},
		isInputOnboardingVisible: () => isInputOnboardingVisible.call(harness),
		isChatTipSuppressed: () => isChatTipSuppressed.call(harness),
		updateChatTipVisibility: () => updateChatTipVisibility.call(harness),
		_clearChatTip: () => visibilityChanges.push('hidden'),
		_renderChatTip: () => visibilityChanges.push('visible'),
	};
	return harness;
}

function createHarness(
	pendingPreferredUpgrade: MutableDisposable<IDisposable>,
	newSessionCreation: MutableDisposable<IDisposable>,
	onDidChangeSessionTypes: Event<void>,
	createSessionNow: (token: CancellationToken) => Promise<IOpenNewSessionResult>,
): INewChatWidgetHarness {
	const harness: INewChatWidgetHarness = {
		_pendingPreferredUpgrade: pendingPreferredUpgrade,
		_newSessionCreation: newSessionCreation,
		sessionsManagementService: { onDidChangeSessionTypes },
		_session: observableValue<IActiveSession | undefined>('session', undefined),
		_newChatInput: {
			sessionTypePicker: {
				getUserPickedSessionType: () => undefined,
				getPreferredSessionType: () => undefined,
			},
		},
		_isPreferredServable: () => false,
		_createSessionNow: (_folderUri, _userPick, token) => createSessionNow(token),
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

	test('hides tips for notifications until all suppressors are inactive', () => {
		const visibilityChanges = ['visible'];
		const storageValues = new Map([['agentSessions.telemetry.totalSessions', 2]]);
		const harness = createChatTipVisibilityHarness(visibilityChanges, storageValues);

		setInputNotificationVisible.call(harness, true);
		setInputOnboardingVisible.call(harness, true);
		setInputNotificationVisible.call(harness, false);
		setInputOnboardingVisible.call(harness, false);

		assert.deepStrictEqual(visibilityChanges, ['visible', 'hidden', 'hidden', 'hidden', 'visible']);
	});

	test('hides tips for users below the session count threshold', () => {
		const visibilityChanges = ['visible'];
		const storageValues = new Map([['agentSessions.telemetry.totalSessions', 0]]);
		const harness = createChatTipVisibilityHarness(visibilityChanges, storageValues);

		// Tips should be hidden because session count is 0 (below the threshold of 2)
		updateChatTipVisibility.call(harness);

		assert.deepStrictEqual(visibilityChanges, ['visible', 'hidden']);
	});

	test('shows tips for users at or above the session count threshold', () => {
		const visibilityChanges: string[] = [];
		const storageValues = new Map([['agentSessions.telemetry.totalSessions', 2]]);
		const harness = createChatTipVisibilityHarness(visibilityChanges, storageValues);

		// Tips should be visible because session count is 2 (at the threshold)
		updateChatTipVisibility.call(harness);

		assert.deepStrictEqual(visibilityChanges, ['visible']);
	});
});
