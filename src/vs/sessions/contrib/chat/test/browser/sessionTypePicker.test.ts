/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IProviderSessionType, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IPickedSessionType, IPreferredSessionType, ISessionTypePickerOptions, SessionTypePicker } from '../../browser/sessionTypePicker.js';

// ---- Mocks ------------------------------------------------------------------

class MockSessionsManagementService extends Disposable {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	private _types: IProviderSessionType[] = [];
	private _quickChatTypes: IProviderSessionType[] = [];
	private readonly _typesByFolder = new Map<string, IProviderSessionType[]>();

	setSessionTypes(types: IProviderSessionType[]): void {
		this._types = types;
		this._onDidChangeSessionTypes.fire();
	}

	setSessionTypesForFolder(folderUri: URI, types: IProviderSessionType[]): void {
		this._typesByFolder.set(folderUri.toString(), types);
		this._onDidChangeSessionTypes.fire();
	}

	setQuickChatSessionTypes(types: IProviderSessionType[]): void {
		this._quickChatTypes = types;
		this._onDidChangeSessionTypes.fire();
	}

	getSessionTypesForFolder(folderUri: URI): IProviderSessionType[] {
		return this._typesByFolder.get(folderUri.toString()) ?? this._types;
	}

	getQuickChatSessionTypes(): IProviderSessionType[] {
		return this._quickChatTypes;
	}
}

function createFakeQuickChatSession(providerId: string, sessionTypeId: string): ISession {
	return {
		providerId,
		sessionType: sessionTypeId,
		workspace: constObservable(undefined),
		isQuickChat: constObservable(true),
	} as unknown as ISession;
}

function sessionType(providerId: string, id: string, label: string, chatSessionType?: string): IProviderSessionType {
	return { providerId, sessionType: { id, label, icon: Codicon.terminal, chatSessionType } };
}

function createFakeSession(providerId: string, sessionTypeId: string, folderUri: URI): ISession {
	const workspace: ISessionWorkspace = {
		uri: folderUri,
		label: folderUri.path,
		icon: Codicon.folder,
		folders: [{
			root: folderUri,
			workingDirectory: folderUri,
			name: folderUri.path,
			description: undefined,
			gitRepository: { uri: folderUri, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
		}],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
	return {
		providerId,
		sessionType: sessionTypeId,
		workspace: constObservable(workspace),
	} as unknown as ISession;
}

/** Exposes the protected user-pick handler so tests can drive the real write path. */
class TestSessionTypePicker extends SessionTypePicker {
	pick(p: IPickedSessionType): void {
		this._handleSelectedSessionType(p);
	}

	showPicker(): void {
		this._showPicker();
	}
}

function createPicker(
	disposables: DisposableStore,
	session: ISettableObservable<ISession | undefined>,
	managementService: MockSessionsManagementService,
	storage: IStorageService,
	options?: ISessionTypePickerOptions,
	actionWidgetService: Partial<IActionWidgetService> = { isVisible: false, hide: () => { }, show: () => { } },
): TestSessionTypePicker {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stub(IActionWidgetService, actionWidgetService);
	instantiationService.stub(ISessionsManagementService, managementService);
	instantiationService.stub(ISessionsProvidersService, { getProvider: () => undefined });
	instantiationService.stub(IStorageService, storage);
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(IChatSessionsService, {
		supportsAutoModelForSessionType: () => false,
		requiresCustomModelsForSessionType: () => false,
		getChatSessionContribution: () => undefined,
	});
	instantiationService.stub(IChatEntitlementService, { entitlement: ChatEntitlement.Pro });
	instantiationService.stub(ILanguageModelsService, {
		getLanguageModelIds: () => [],
		lookupLanguageModel: () => undefined,
	});
	instantiationService.stub(IContextKeyService, new MockContextKeyService());
	return disposables.add(instantiationService.createInstance(TestSessionTypePicker, session, options));
}

// ---- Tests ------------------------------------------------------------------

suite('SessionTypePicker', () => {

	const disposables = new DisposableStore();
	const folder = URI.file('/project');

	let management: MockSessionsManagementService;
	let storage: TestStorageService;
	let session: ISettableObservable<ISession | undefined>;

	setup(() => {
		management = disposables.add(new MockSessionsManagementService());
		storage = disposables.add(new TestStorageService());
		session = observableValue<ISession | undefined>('session', undefined);
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('preferred session type is the first one and follows session-type changes', () => {
		management.setSessionTypes([
			sessionType('local-1', 'local', 'Local'),
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
		]);
		const picker = createPicker(disposables, session, management, storage);

		assert.deepStrictEqual(picker.getPreferredSessionType(folder), { providerId: 'local-1', sessionTypeId: 'local' });

		// A late-registering provider prepends a new type → preferred follows it.
		management.setSessionTypes([
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
			sessionType('local-1', 'local', 'Local'),
		]);

		assert.deepStrictEqual(picker.getPreferredSessionType(folder), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
	});

	test('user picked session type is persisted and survives reload', () => {
		management.setSessionTypes([
			sessionType('local-1', 'local', 'Local'),
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
		]);
		const picker = createPicker(disposables, session, management, storage);

		// No explicit pick yet.
		assert.strictEqual(picker.getUserPickedSessionType(), undefined);

		picker.pick({ providerId: 'copilot', sessionTypeId: 'copilot-cli' });
		assert.deepStrictEqual(picker.getUserPickedSessionType(), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });

		// Simulate a reload: a fresh picker reading the same storage restores the pick.
		const reloaded = createPicker(disposables, observableValue<ISession | undefined>('session2', undefined), management, storage);
		assert.deepStrictEqual(reloaded.getUserPickedSessionType(), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
		assert.deepStrictEqual(reloaded.selectedPick, { providerId: 'copilot', sessionTypeId: 'copilot-cli' } as IPreferredSessionType);
	});

	test('observing an active session does not overwrite the user pick', () => {
		management.setSessionTypes([
			sessionType('local-1', 'local', 'Local'),
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
		]);
		const picker = createPicker(disposables, session, management, storage);

		picker.pick({ providerId: 'copilot', sessionTypeId: 'copilot-cli' });

		// An active session of a different type becomes current.
		session.set(createFakeSession('local-1', 'local', folder), undefined);

		// The in-memory display reflects the active session, but the stored
		// user pick is untouched (only an explicit pick changes it).
		assert.deepStrictEqual(picker.selectedPick, { providerId: 'local-1', sessionTypeId: 'local' });
		assert.deepStrictEqual(picker.getUserPickedSessionType(), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
	});

	test('re-selecting the default (first) session type clears the stored pick', () => {
		management.setSessionTypes([
			sessionType('local-1', 'local', 'Local'),
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
		]);
		const picker = createPicker(disposables, session, management, storage);

		// The picker reflects the active session's folder types (the picker is
		// always shown with an in-flight draft session in the composer).
		session.set(createFakeSession('local-1', 'local', folder), undefined);

		// Pick a non-default type → stored.
		picker.pick({ providerId: 'copilot', sessionTypeId: 'copilot-cli' });
		assert.deepStrictEqual(picker.getUserPickedSessionType(), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });

		// Switch back to the default (first) type → stored pick is cleared.
		picker.pick({ providerId: 'local-1', sessionTypeId: 'local' });
		assert.strictEqual(picker.getUserPickedSessionType(), undefined);
	});

	test('explicit pick is persisted even when the visible pick is unchanged', () => {
		management.setSessionTypes([
			sessionType('local-1', 'local', 'Local'),
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
		]);
		const picker = createPicker(disposables, session, management, storage);

		// An active session of a non-default type is current, so the visible
		// pick reflects it even though nothing has been stored yet.
		session.set(createFakeSession('copilot', 'copilot-cli', folder), undefined);
		assert.deepStrictEqual(picker.selectedPick, { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
		assert.strictEqual(picker.getUserPickedSessionType(), undefined);

		// Explicitly picking that same (already-visible) non-default type still
		// persists the preference.
		picker.pick({ providerId: 'copilot', sessionTypeId: 'copilot-cli' });
		assert.deepStrictEqual(picker.getUserPickedSessionType(), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });

		// Explicitly picking the (already-visible) default type clears it again.
		session.set(createFakeSession('local-1', 'local', folder), undefined);
		picker.pick({ providerId: 'local-1', sessionTypeId: 'local' });
		assert.strictEqual(picker.getUserPickedSessionType(), undefined);
	});

	test('persistSelection false never mutates the shared New Session preference', () => {
		management.setSessionTypes([
			sessionType('local-1', 'local', 'Local'),
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
			sessionType('anthropic', 'claude', 'Claude'),
		]);

		// The New Session composer stored an explicit, non-default preference.
		const shared = createPicker(disposables, session, management, storage);
		shared.pick({ providerId: 'copilot', sessionTypeId: 'copilot-cli' });
		assert.deepStrictEqual(shared.getUserPickedSessionType(), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });

		// The automations dialog picker still reads that stored preference to seed
		// a sensible default, but must never write or clear it.
		const scopedSession = observableValue<ISession | undefined>('scoped', undefined);
		const scoped = createPicker(disposables, scopedSession, management, storage, { persistSelection: false });
		assert.deepStrictEqual(scoped.getUserPickedSessionType(), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
		// Give the scoped picker a folder so 'local' is its default type.
		scopedSession.set(createFakeSession('local-1', 'local', folder), undefined);

		// A different non-default pick would normally be written — it must not be.
		scoped.pick({ providerId: 'anthropic', sessionTypeId: 'claude' });
		assert.deepStrictEqual(shared.getUserPickedSessionType(), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });

		// Picking the default type would normally clear the stored pick — it must not.
		scoped.pick({ providerId: 'local-1', sessionTypeId: 'local' });
		assert.deepStrictEqual(shared.getUserPickedSessionType(), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
	});

	test('onDidChangeSelectedPick fires when session types are advertised after the picker is created', () => {
		// No types advertised yet (e.g. the agent host has not connected).
		management.setSessionTypes([]);
		const picker = createPicker(disposables, session, management, storage);
		const folderObs = observableValue<URI | undefined>('folder', folder);
		picker.setFolderSource(folderObs);
		assert.strictEqual(picker.selectedPick, undefined);

		const fired: (IPreferredSessionType | undefined)[] = [];
		disposables.add(picker.onDidChangeSelectedPick(pick => fired.push(pick)));

		// A provider advertises its types late; the displayed default shifts on its
		// own (no explicit user pick), and consumers that cache the pick are notified.
		management.setSessionTypes([
			sessionType('local-1', 'local', 'Local'),
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
		]);

		assert.deepStrictEqual(picker.selectedPick, { providerId: 'local-1', sessionTypeId: 'local' });
		assert.deepStrictEqual(fired, [{ providerId: 'local-1', sessionTypeId: 'local' }]);
	});

	test('exposes the selected concrete model target reactively', () => {
		management.setSessionTypes([
			sessionType('local-1', 'local', 'Local'),
			sessionType('agent-host', 'copilotcli', 'Copilot CLI', 'agent-host-copilotcli'),
		]);
		const picker = createPicker(disposables, session, management, storage);
		const targets: (string | undefined)[] = [];
		disposables.add(autorun(reader => targets.push(picker.modelTargetChatSessionType.read(reader))));

		picker.setFolderSource(observableValue<URI | undefined>('folder', folder));
		picker.pick({ providerId: 'agent-host', sessionTypeId: 'copilotcli' });

		assert.deepStrictEqual(targets, [undefined, 'local', 'agent-host-copilotcli']);
	});

	test('a quick chat sources its types from the quick-chat list, not the folder list', () => {
		// Folder list is empty (workspace-less); quick-chat list drives defaults.
		management.setSessionTypes([]);
		management.setQuickChatSessionTypes([
			sessionType('local-1', 'local', 'Local'),
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
		]);
		const picker = createPicker(disposables, session, management, storage);

		session.set(createFakeQuickChatSession('local-1', 'local'), undefined);

		// Picking the first quick-chat type is "the default" → stored pick cleared.
		// (Were the picker still folder-sourced, the empty folder list would make
		// nothing the default and this would persist instead.)
		picker.pick({ providerId: 'local-1', sessionTypeId: 'local' });
		assert.strictEqual(picker.getUserPickedSessionType(), undefined);

		// Picking a non-first quick-chat type is stored.
		picker.pick({ providerId: 'copilot', sessionTypeId: 'copilot-cli' });
		assert.deepStrictEqual(picker.getUserPickedSessionType(), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
	});

	test('folder-driven quick-chat mode preserves an unavailable saved target through late discovery', () => {
		const saved = { providerId: 'agent-host', sessionTypeId: 'copilotcli' };
		management.setQuickChatSessionTypes([
			sessionType('fallback', 'fallback', 'Fallback'),
		]);
		const picker = createPicker(disposables, session, management, storage, { persistSelection: false });
		picker.setFolderSource(observableValue<URI | undefined>('folder', undefined), {
			initialPick: saved,
			preserveUnavailableInitialPick: true,
		});
		picker.setQuickChatSource(observableValue('quickChat', true));

		const beforeDiscovery = picker.selectedPick;
		management.setQuickChatSessionTypes([
			sessionType('fallback', 'fallback', 'Fallback'),
			sessionType('agent-host', 'copilotcli', 'Copilot CLI'),
		]);

		assert.deepStrictEqual({
			beforeDiscovery,
			afterDiscovery: picker.selectedPick,
		}, {
			beforeDiscovery: saved,
			afterDiscovery: saved,
		});
	});

	test('folder-driven quick-chat mode keeps an available non-default initial pick', () => {
		const proposed = { providerId: 'agent-host', sessionTypeId: 'copilotcli' };
		management.setQuickChatSessionTypes([
			sessionType('fallback', 'fallback', 'Fallback'),
			sessionType('agent-host', 'copilotcli', 'Copilot CLI'),
		]);
		const picker = createPicker(disposables, session, management, storage, { persistSelection: false });

		picker.setQuickChatSource(observableValue('quickChat', true));
		picker.setFolderSource(observableValue<URI | undefined>('folder', undefined), {
			initialPick: proposed,
		});

		assert.deepStrictEqual(picker.selectedPick, proposed);
	});

	test('quick-chat mode concretizes a provider-less legacy workspace pick', () => {
		const type = sessionType('agent-host', 'copilotcli', 'Copilot CLI');
		management.setSessionTypesForFolder(folder, [type]);
		management.setQuickChatSessionTypes([type]);
		const picker = createPicker(disposables, session, management, storage, { persistSelection: false });
		picker.setFolderSource(observableValue<URI | undefined>('folder', folder), {
			initialPick: { sessionTypeId: 'copilotcli' },
			preserveUnavailableInitialPick: true,
		});
		const quickChat = observableValue('quickChat', false);
		picker.setQuickChatSource(quickChat);
		const workspacePick = picker.selectedPick;

		quickChat.set(true, undefined);

		assert.deepStrictEqual({
			workspacePick,
			quickChatPick: picker.selectedPick,
		}, {
			workspacePick: { sessionTypeId: 'copilotcli' },
			quickChatPick: { providerId: 'agent-host', sessionTypeId: 'copilotcli' },
		});
	});

	test('folder-driven mode ignores the active session and defaults to the folder preferred type', () => {
		const folderA = URI.file('/a');
		management.setSessionTypesForFolder(folderA, [
			sessionType('local-1', 'local', 'Local'),
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
		]);
		const picker = createPicker(disposables, session, management, storage);

		// An active session of a specific type is present...
		session.set(createFakeSession('copilot', 'copilot-cli', folderA), undefined);

		// ...but switching to folder-driven mode makes the folder authoritative,
		// so the display defaults to the folder's preferred (first) type.
		picker.setFolderSource(observableValue<URI | undefined>('folder', folderA));

		assert.deepStrictEqual(picker.selectedPick, { providerId: 'local-1', sessionTypeId: 'local' });
	});

	test('folder-driven mode seeds the provided initial pick', () => {
		const folderA = URI.file('/a');
		management.setSessionTypesForFolder(folderA, [
			sessionType('local-1', 'local', 'Local'),
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
		]);
		const picker = createPicker(disposables, session, management, storage);

		picker.setFolderSource(observableValue<URI | undefined>('folder', folderA), {
			initialPick: { providerId: 'copilot', sessionTypeId: 'copilot-cli' },
		});

		assert.deepStrictEqual(picker.selectedPick, { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
	});

	test('folder-driven mode preserves an unavailable initial pick until its provider appears', () => {
		const folderA = URI.file('/a');
		management.setSessionTypesForFolder(folderA, [
			sessionType('local-1', 'local', 'Local'),
		]);
		const picker = createPicker(disposables, session, management, storage);

		picker.setFolderSource(observableValue<URI | undefined>('folder', folderA), {
			initialPick: { providerId: 'copilot', sessionTypeId: 'copilot-cli' },
			preserveUnavailableInitialPick: true,
		});
		assert.deepStrictEqual(picker.selectedPick, { providerId: 'copilot', sessionTypeId: 'copilot-cli' });

		management.setSessionTypesForFolder(folderA, [
			sessionType('local-1', 'local', 'Local'),
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
		]);

		assert.deepStrictEqual(picker.selectedPick, { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
	});

	test('folder-driven mode can replace a pending pick when only one alternative is available', () => {
		const folderA = URI.file('/a');
		management.setSessionTypesForFolder(folderA, [
			sessionType('local-1', 'local', 'Local'),
		]);
		let pickerShown = false;
		const picker = createPicker(disposables, session, management, storage, undefined, {
			isVisible: false,
			hide: () => { },
			show: () => { pickerShown = true; },
		});
		picker.setFolderSource(observableValue<URI | undefined>('folder', folderA), {
			initialPick: { providerId: 'copilot', sessionTypeId: 'copilot-cli' },
			preserveUnavailableInitialPick: true,
		});
		picker.render(document.createElement('div'));

		picker.showPicker();

		assert.strictEqual(pickerShown, true);
	});

	test('folder-driven mode re-defaults when a folder change no longer serves the pick', () => {
		const folderA = URI.file('/a');
		const folderB = URI.file('/b');
		management.setSessionTypesForFolder(folderA, [
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
			sessionType('local-1', 'local', 'Local'),
		]);
		management.setSessionTypesForFolder(folderB, [
			sessionType('local-1', 'local', 'Local'),
		]);
		const picker = createPicker(disposables, session, management, storage);
		const folderObs = observableValue<URI | undefined>('folder', folderA);
		picker.setFolderSource(folderObs, { initialPick: { providerId: 'copilot', sessionTypeId: 'copilot-cli' } });

		// Folder B does not serve copilot-cli, so the pick re-defaults to B's preferred type.
		folderObs.set(folderB, undefined);

		assert.deepStrictEqual(picker.selectedPick, { providerId: 'local-1', sessionTypeId: 'local' });
	});

	test('folder-driven mode falls back to the stored user pick when served by the folder', () => {
		const folderA = URI.file('/a');
		management.setSessionTypesForFolder(folderA, [
			sessionType('local-1', 'local', 'Local'),
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
		]);

		// Store a non-default user preference.
		const seeding = createPicker(disposables, session, management, storage);
		seeding.pick({ providerId: 'copilot', sessionTypeId: 'copilot-cli' });

		// A fresh folder-driven picker with no initial pick restores that stored preference.
		const picker = createPicker(disposables, observableValue<ISession | undefined>('session2', undefined), management, storage);
		picker.setFolderSource(observableValue<URI | undefined>('folder', folderA));

		assert.deepStrictEqual(picker.selectedPick, { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
	});

	test('folder-driven mode persists an explicit pick, clears on default, and fires the change event', () => {
		const folderA = URI.file('/a');
		management.setSessionTypesForFolder(folderA, [
			sessionType('local-1', 'local', 'Local'),
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
		]);
		const picker = createPicker(disposables, session, management, storage);
		picker.setFolderSource(observableValue<URI | undefined>('folder', folderA));

		const fired: (IPickedSessionType | undefined)[] = [];
		disposables.add(picker.onDidSelectSessionType(e => fired.push(e)));

		// A non-default type is stored; the folder's default (first) type clears it.
		picker.pick({ providerId: 'copilot', sessionTypeId: 'copilot-cli' });
		picker.pick({ providerId: 'local-1', sessionTypeId: 'local' });

		assert.deepStrictEqual({
			stored: picker.getUserPickedSessionType(),
			selected: picker.selectedPick,
			fired,
		}, {
			stored: undefined,
			selected: { providerId: 'local-1', sessionTypeId: 'local' },
			fired: [
				{ providerId: 'copilot', sessionTypeId: 'copilot-cli' },
				{ providerId: 'local-1', sessionTypeId: 'local' },
			],
		});
	});

	test('folder-driven mode has no selection until the folder resolves types', () => {
		const folderA = URI.file('/a');
		management.setSessionTypesForFolder(folderA, [
			sessionType('local-1', 'local', 'Local'),
		]);
		const picker = createPicker(disposables, session, management, storage);
		const folderObs = observableValue<URI | undefined>('folder', undefined);
		picker.setFolderSource(folderObs);

		// No folder -> no types -> no selection; selecting a folder resolves the default.
		const before = picker.selectedPick;
		folderObs.set(folderA, undefined);
		const after = picker.selectedPick;

		assert.deepStrictEqual({ before, after }, {
			before: undefined,
			after: { providerId: 'local-1', sessionTypeId: 'local' },
		});
	});

	test('folder-driven mode prefers the stored pick over the folder default when the initial pick is unavailable', () => {
		const folderA = URI.file('/a');
		management.setSessionTypesForFolder(folderA, [
			sessionType('local-1', 'local', 'Local'),
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
		]);

		// Store copilot-cli (a non-default, folder-served preference).
		const seeding = createPicker(disposables, session, management, storage);
		seeding.pick({ providerId: 'copilot', sessionTypeId: 'copilot-cli' });

		// The initial pick is a type the folder does not serve, so it is dropped in
		// favor of the stored pick rather than the folder's preferred (first) type.
		const picker = createPicker(disposables, observableValue<ISession | undefined>('session2', undefined), management, storage);
		picker.setFolderSource(observableValue<URI | undefined>('folder', folderA), {
			initialPick: { providerId: 'claude', sessionTypeId: 'claude-code' },
		});

		assert.deepStrictEqual(picker.selectedPick, { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
	});
});
