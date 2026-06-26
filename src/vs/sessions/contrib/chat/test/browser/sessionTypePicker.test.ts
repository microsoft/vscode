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
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IProviderSessionType, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IPickedSessionType, IPreferredSessionType, SessionTypePicker } from '../../browser/sessionTypePicker.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';

class ConfigurableChatEntitlementService extends mock<IChatEntitlementService>() {
	override readonly onDidChangeEntitlement = Event.None;
	override readonly onDidChangeQuotaExceeded = Event.None;
	override readonly onDidChangeQuotaRemaining = Event.None;
	override readonly onDidChangeUsageBasedBilling = Event.None;
	override readonly onDidChangeSentiment = Event.None;
	override readonly onDidChangeAnonymous = Event.None;
	override entitlement = ChatEntitlement.Unknown;
	override readonly entitlementObs = observableValue('entitlement', ChatEntitlement.Unknown);
	override readonly previewFeaturesDisabled = false;
	override readonly clientByokEnabled = true;
	override hasByokModels = false;
	override readonly organisations = undefined;
	override readonly isInternal = false;
	override readonly sku = undefined;
	override readonly copilotTrackingId = undefined;
	override readonly quotas = {};
	override readonly sentiment = {};
	override readonly sentimentObs = observableValue('sentiment', {});
	override readonly anonymous = false;
	override readonly anonymousObs = observableValue('anonymous', false);
	override acceptQuotas(): void { }
	override clearQuotas(): void { }
	override markAnonymousRateLimited(): void { }
	override markSetupCompleted(): void { }
	override setForceHidden(_hidden: boolean): void { }
	override update(): Promise<void> { return Promise.resolve(); }
}

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
	entitlementService?: ConfigurableChatEntitlementService,
	providersService?: ISessionsProvidersService,
): TestSessionTypePicker {
	const instantiationService = disposables.add(new TestInstantiationService());
	const entitlement = entitlementService ?? new ConfigurableChatEntitlementService();
	instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => { }, show: () => { } });
	instantiationService.stub(ISessionsManagementService, managementService);
	instantiationService.stub(ISessionsProvidersService, providersService ?? { getProvider: () => undefined });
	instantiationService.stub(IStorageService, storage);
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(IChatEntitlementService, entitlement);
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

	test('BYOK-only users prefer Local even when Copilot CLI is first', () => {
		management.setSessionTypes([
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
			sessionType('local-1', 'local', 'Local'),
		]);
		const entitlement = new ConfigurableChatEntitlementService();
		entitlement.hasByokModels = true;
		entitlement.entitlement = ChatEntitlement.Unknown;
		const picker = createPicker(disposables, session, management, storage, entitlement);

		assert.deepStrictEqual(picker.getPreferredSessionType(folder), { providerId: 'local-1', sessionTypeId: 'local' });
	});

	test('signed-in Copilot users keep the first session type as preferred', () => {
		management.setSessionTypes([
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
			sessionType('local-1', 'local', 'Local'),
		]);
		const entitlement = new ConfigurableChatEntitlementService();
		entitlement.hasByokModels = true;
		entitlement.entitlement = ChatEntitlement.Free;
		const picker = createPicker(disposables, session, management, storage, entitlement);

		assert.deepStrictEqual(picker.getPreferredSessionType(folder), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
	});

	test('BYOK-only falls back to first type when Local is unavailable', () => {
		management.setSessionTypes([
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
		]);
		const entitlement = new ConfigurableChatEntitlementService();
		entitlement.hasByokModels = true;
		entitlement.entitlement = ChatEntitlement.Unknown;
		const picker = createPicker(disposables, session, management, storage, entitlement);

		assert.deepStrictEqual(picker.getPreferredSessionType(folder), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
	});

	test('BYOK-only ignores stored non-Local session type preference', () => {
		management.setSessionTypes([
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
			sessionType('local-1', 'local', 'Local'),
		]);
		const entitlement = new ConfigurableChatEntitlementService();
		entitlement.hasByokModels = true;
		entitlement.entitlement = ChatEntitlement.Unknown;
		const picker = createPicker(disposables, session, management, storage, entitlement);

		picker.pick({ providerId: 'copilot', sessionTypeId: 'copilot-cli' });
		assert.deepStrictEqual(picker.getUserPickedSessionType(), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
		assert.strictEqual(picker.getEffectiveUserPickedSessionType(folder), undefined);
		assert.deepStrictEqual(picker.getPreferredSessionType(folder), { providerId: 'local-1', sessionTypeId: 'local' });
	});

	test('BYOK-only honors explicit non-Local pick made this session', () => {
		management.setSessionTypes([
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
			sessionType('local-1', 'local', 'Local'),
		]);
		const entitlement = new ConfigurableChatEntitlementService();
		entitlement.hasByokModels = true;
		entitlement.entitlement = ChatEntitlement.Unknown;
		session.set(createFakeSession('local-1', 'local', folder), undefined);
		const picker = createPicker(disposables, session, management, storage, entitlement);

		picker.pick({ providerId: 'copilot', sessionTypeId: 'copilot-cli' });
		assert.deepStrictEqual(picker.getEffectiveUserPickedSessionType(folder), { providerId: 'copilot', sessionTypeId: 'copilot-cli' });
		assert.strictEqual(picker.hasExplicitNonLocalPickThisSession(), true);
	});

	test('BYOK-only keeps stored Local session type preference', () => {
		management.setSessionTypes([
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
			sessionType('local-1', 'local', 'Local'),
		]);
		const entitlement = new ConfigurableChatEntitlementService();
		entitlement.hasByokModels = true;
		entitlement.entitlement = ChatEntitlement.Unknown;
		const picker = createPicker(disposables, session, management, storage, entitlement);

		picker.pick({ providerId: 'local-1', sessionTypeId: 'local' });
		assert.deepStrictEqual(picker.getEffectiveUserPickedSessionType(folder), { providerId: 'local-1', sessionTypeId: 'local' });
	});

	test('unsigned-in users prefer Local when local provider already has models', () => {
		management.setSessionTypes([
			sessionType('copilot', 'copilot-cli', 'Copilot CLI'),
			sessionType('local-1', 'local', 'Local'),
		]);
		const entitlement = new ConfigurableChatEntitlementService();
		entitlement.entitlement = ChatEntitlement.Unknown;
		class LocalProviderWithModels extends mock<ISessionsProvider>() {
			override getModels() {
				return [{ identifier: 'customendpoint/test', metadata: { name: 'Test' } as never }];
			}
		}
		class MockProvidersService extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(id: string): T | undefined {
				return (id === 'local-1' ? new LocalProviderWithModels() : undefined) as T | undefined;
			}
		}
		const picker = createPicker(disposables, session, management, storage, entitlement, new MockProvidersService());

		assert.deepStrictEqual(picker.getPreferredSessionType(folder), { providerId: 'local-1', sessionTypeId: 'local' });
		assert.strictEqual(picker.getEffectiveUserPickedSessionType(folder), undefined);
	});
});
