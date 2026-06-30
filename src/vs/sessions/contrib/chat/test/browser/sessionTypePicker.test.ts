/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
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
import { IPickedSessionType, IPreferredSessionType, SessionTypePicker } from '../../browser/sessionTypePicker.js';

// ---- Mocks ------------------------------------------------------------------

class MockSessionsManagementService extends Disposable {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	private _types: IProviderSessionType[] = [];

	setSessionTypes(types: IProviderSessionType[]): void {
		this._types = types;
		this._onDidChangeSessionTypes.fire();
	}

	getSessionTypesForFolder(_folderUri: URI): IProviderSessionType[] {
		return this._types;
	}
}

function sessionType(providerId: string, id: string, label: string): IProviderSessionType {
	return { providerId, sessionType: { id, label, icon: Codicon.terminal } };
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
}

function createPicker(
	disposables: DisposableStore,
	session: ISettableObservable<ISession | undefined>,
	managementService: MockSessionsManagementService,
	storage: IStorageService,
): TestSessionTypePicker {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => { }, show: () => { } });
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
	return disposables.add(instantiationService.createInstance(TestSessionTypePicker, session));
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
});
