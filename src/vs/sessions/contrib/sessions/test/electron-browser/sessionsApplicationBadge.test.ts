/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { BufferReader, BufferWriter, deserialize, serialize } from '../../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IApplicationBadge, INativeHostService } from '../../../../../platform/native/common/native.js';
import product from '../../../../../platform/product/common/product.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { BlockedSessions } from '../../../blockedSessions/browser/blockedSessions.js';
import { SESSIONS_APPLICATION_BADGE_OPTIONS_DEFAULT, SESSIONS_APPLICATION_BADGE_OPTIONS_SETTING, SESSIONS_APPLICATION_BADGE_SETTING, SessionsApplicationBadge } from '../../electron-browser/sessionsApplicationBadge.js';

class TestSessionsManagementService extends mock<ISessionsManagementService>() {

	private readonly _onDidChangeSessions = new Emitter<ISessionsChangeEvent>();
	override readonly onDidChangeSessions = this._onDidChangeSessions.event;

	readonly sessions: ISession[] = [];

	override getSessions(): ISession[] {
		return [...this.sessions];
	}

	change(): void {
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [] });
	}

	dispose(): void {
		this._onDidChangeSessions.dispose();
	}
}

class TestNativeHostService extends mock<INativeHostService>() {

	readonly badges: (IApplicationBadge | undefined)[] = [];

	override async setApplicationBadge(badge: IApplicationBadge | undefined): Promise<void> {
		this.badges.push(badge);
	}
}

class TestBlockedSessions extends mock<BlockedSessions>() {

	private readonly _failingCISessions = observableValue<readonly ISession[]>('failingCISessions', []);
	override readonly failingCISessions = this._failingCISessions;

	setFailingCISessions(sessions: readonly ISession[]): void {
		this._failingCISessions.set(sessions, undefined);
	}

	override dispose(): void { }
}

function createSession(id: string, state: { status?: SessionStatus; isRead?: boolean; isArchived?: boolean }) {
	const status = observableValue<SessionStatus>(`status-${id}`, state.status ?? SessionStatus.Completed);
	const isRead = observableValue(`isRead-${id}`, state.isRead ?? true);
	const isArchived = observableValue(`isArchived-${id}`, state.isArchived ?? false);

	const session = new class extends mock<ISession>() {
		override readonly sessionId = id;
		override readonly resource = URI.parse(`test:///${id}`);
		override readonly status = status;
		override readonly isRead = isRead;
		override readonly isArchived = isArchived;
	};

	return { session, status, isRead, isArchived };
}

suite('SessionsApplicationBadge', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createBadgeWithConfiguration(sessions: ISession[], configuration: TestConfigurationService) {
		const management = store.add(new TestSessionsManagementService());
		management.sessions.push(...sessions);

		const nativeHost = new TestNativeHostService();
		const blockedSessions = new TestBlockedSessions();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stubInstance(BlockedSessions, blockedSessions);

		store.add(new SessionsApplicationBadge(management, nativeHost, configuration, new TestThemeService(), instantiationService));

		return { management, nativeHost, configuration, blockedSessions };
	}

	function createBadge(sessions: ISession[], enabled = true, options: Partial<typeof SESSIONS_APPLICATION_BADGE_OPTIONS_DEFAULT> = {}) {
		return createBadgeWithConfiguration(sessions, new TestConfigurationService({
			[SESSIONS_APPLICATION_BADGE_SETTING]: enabled,
			[SESSIONS_APPLICATION_BADGE_OPTIONS_SETTING]: { ...SESSIONS_APPLICATION_BADGE_OPTIONS_DEFAULT, ...options },
		}));
	}

	function badgeCounts(nativeHost: TestNativeHostService): (number | undefined)[] {
		return nativeHost.badges.map(badge => badge?.count);
	}

	test('defaults to counting only sessions that need input', () => {
		const needsInput = createSession('needs-input', { status: SessionStatus.NeedsInput });
		const unread = createSession('unread', { isRead: false });
		const failingCI = createSession('failing-ci', {});
		const { nativeHost, blockedSessions } = createBadgeWithConfiguration(
			[needsInput.session, unread.session, failingCI.session],
			new TestConfigurationService({ [SESSIONS_APPLICATION_BADGE_SETTING]: true }),
		);

		blockedSessions.setFailingCISessions([failingCI.session]);

		assert.deepStrictEqual({
			defaults: SESSIONS_APPLICATION_BADGE_OPTIONS_DEFAULT,
			counts: badgeCounts(nativeHost),
		}, {
			defaults: { inputNeeded: true, unread: false, ciFailing: false },
			counts: [1],
		});
	});

	for (const { options, expectedCount } of [
		{ options: { inputNeeded: false, unread: false, ciFailing: false }, expectedCount: 0 },
		{ options: { inputNeeded: true, unread: false, ciFailing: false }, expectedCount: 4 },
		{ options: { inputNeeded: false, unread: true, ciFailing: false }, expectedCount: 4 },
		{ options: { inputNeeded: false, unread: false, ciFailing: true }, expectedCount: 4 },
		{ options: { inputNeeded: true, unread: true, ciFailing: false }, expectedCount: 6 },
		{ options: { inputNeeded: true, unread: false, ciFailing: true }, expectedCount: 6 },
		{ options: { inputNeeded: false, unread: true, ciFailing: true }, expectedCount: 6 },
		{ options: { inputNeeded: true, unread: true, ciFailing: true }, expectedCount: 7 },
	]) {
		test(`counts each matching session once with ${JSON.stringify(options)}`, () => {
			const needsInput = createSession('needs-input', { status: SessionStatus.NeedsInput });
			const unreadNeedsInput = createSession('unread-needs-input', { status: SessionStatus.NeedsInput, isRead: false });
			const failingCI = createSession('failing-ci', {});
			const unreadFailingCI = createSession('unread-failing-ci', { isRead: false });
			const needsInputFailingCI = createSession('needs-input-failing-ci', { status: SessionStatus.NeedsInput });
			const unreadNeedsInputFailingCI = createSession('unread-needs-input-failing-ci', { status: SessionStatus.NeedsInput, isRead: false });
			const archivedFailingCI = createSession('archived-failing-ci', { isArchived: true });
			const { nativeHost, blockedSessions } = createBadge([
				needsInput.session,
				unreadNeedsInput.session,
				failingCI.session,
				unreadFailingCI.session,
				needsInputFailingCI.session,
				unreadNeedsInputFailingCI.session,
				archivedFailingCI.session,
				createSession('unread', { isRead: false }).session,
				createSession('archived-input', { status: SessionStatus.NeedsInput, isRead: false, isArchived: true }).session,
				createSession('archived-unread', { isRead: false, isArchived: true }).session,
				createSession('in-progress-unread', { status: SessionStatus.InProgress, isRead: false }).session,
				createSession('idle', {}).session,
			], true, options);

			blockedSessions.setFailingCISessions([failingCI.session, unreadFailingCI.session, needsInputFailingCI.session, unreadNeedsInputFailingCI.session, archivedFailingCI.session]);

			assert.strictEqual(nativeHost.badges.at(-1)?.count ?? 0, expectedCount);
		});
	}

	test('counts unread and needs-input sessions, ignoring archived, in-progress unread, and idle ones', () => {
		const { nativeHost } = createBadge([
			createSession('unread', { isRead: false }).session,
			createSession('needs-input', { status: SessionStatus.NeedsInput }).session,
			createSession('unread-and-needs-input', { isRead: false, status: SessionStatus.NeedsInput }).session,
			createSession('in-progress-unread', { isRead: false, status: SessionStatus.InProgress }).session,
			createSession('archived-unread', { isRead: false, isArchived: true }).session,
			createSession('archived-needs-input', { status: SessionStatus.NeedsInput, isArchived: true }).session,
			createSession('idle', {}).session,
		], true, { unread: true });

		assert.deepStrictEqual(nativeHost.badges.map(badge => ({
			count: badge?.count,
			description: badge?.description,
			// Only Windows needs an image, the other platforms render the count
			isPng: badge?.iconDataURL?.startsWith('data:image/png;base64,') ?? false
		})), [
			{ count: 3, description: '3 sessions need your attention', isPng: isWindows }
		]);
	});

	test('counts a read session with failing CI', () => {
		const failingCI = createSession('failing-ci', {});
		const { nativeHost, blockedSessions } = createBadge([failingCI.session], true, { ciFailing: true });

		blockedSessions.setFailingCISessions([failingCI.session]);

		assert.deepStrictEqual(nativeHost.badges.map(badge => ({ count: badge?.count, description: badge?.description })), [
			{ count: 1, description: '1 session needs your attention' }
		]);
	});

	test('uses the product-quality default when the setting value is unavailable', () => {
		const { nativeHost } = createBadgeWithConfiguration(
			[createSession('needs-input', { status: SessionStatus.NeedsInput }).session],
			new TestConfigurationService()
		);

		assert.deepStrictEqual(badgeCounts(nativeHost), product.quality !== 'stable' ? [1] : []);
	});

	test('updates immediately when badge options change and restores defaults when reset', async () => {
		const failingCI = [0, 1, 2].map(index => createSession(`ci-${index}`, {}).session);
		const { nativeHost, configuration, blockedSessions } = createBadge([
			createSession('needs-input', { status: SessionStatus.NeedsInput }).session,
			createSession('unread-1', { isRead: false }).session,
			createSession('unread-2', { isRead: false }).session,
			...failingCI,
		]);
		blockedSessions.setFailingCISessions(failingCI);

		for (const options of [
			{ inputNeeded: false, unread: true, ciFailing: false },
			{ inputNeeded: false, unread: false, ciFailing: true },
			{ inputNeeded: true, unread: true, ciFailing: true },
			{ inputNeeded: false, unread: false, ciFailing: false },
			undefined,
		]) {
			await configuration.setUserConfiguration(SESSIONS_APPLICATION_BADGE_OPTIONS_SETTING, options);
			configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string) { return section === SESSIONS_APPLICATION_BADGE_OPTIONS_SETTING; }
			});
		}

		assert.deepStrictEqual(badgeCounts(nativeHost), [1, 2, 3, 6, undefined, 1]);
	});

	test('is off until enabled and clears when disabled', async () => {
		const { nativeHost, configuration } = createBadge([createSession('needs-input', { status: SessionStatus.NeedsInput }).session], false);

		for (const enabled of [true, false]) {
			await configuration.setUserConfiguration(SESSIONS_APPLICATION_BADGE_SETTING, enabled);
			configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string) { return section === SESSIONS_APPLICATION_BADGE_SETTING; }
			});
		}

		// No badge is pushed while disabled, so a second Agents window cannot
		// clear the application wide badge of the first one on startup.
		assert.deepStrictEqual(nativeHost.badges.map(badge => ({ count: badge?.count, description: badge?.description })), [
			{ count: 1, description: '1 session needs your attention' },
			{ count: undefined, description: undefined },
		]);
	});

	test('follows input-needed status changes with the default options', () => {
		const session = createSession('session', {});
		const { nativeHost } = createBadge([session.session]);

		session.status.set(SessionStatus.NeedsInput, undefined);
		session.status.set(SessionStatus.InProgress, undefined);
		session.status.set(SessionStatus.NeedsInput, undefined);
		session.status.set(SessionStatus.Completed, undefined);

		assert.deepStrictEqual(badgeCounts(nativeHost), [1, undefined, 1, undefined]);
	});

	test('follows session state and session list changes', () => {
		const unread = createSession('unread', { isRead: false });
		const { nativeHost, management } = createBadge([unread.session], true, { unread: true });

		unread.isRead.set(true, undefined);

		const added = createSession('added', { status: SessionStatus.NeedsInput });
		management.sessions.push(added.session);
		management.change();

		added.isArchived.set(true, undefined);

		assert.deepStrictEqual(badgeCounts(nativeHost), [1, undefined, 1, undefined]);
	});

	test('badge survives the IPC round trip to the main process', () => {
		const { nativeHost } = createBadge([createSession('needs-input', { status: SessionStatus.NeedsInput }).session]);

		// The badge crosses a `ProxyChannel` as plain JSON: a nested `VSBuffer`
		// is not revived, and an `undefined` valued property is dropped
		// entirely. Both would make the main process see a different badge.
		const writer = new BufferWriter();
		serialize(writer, [nativeHost.badges[0]]);
		const [revived] = deserialize(new BufferReader(writer.buffer)) as [IApplicationBadge];

		assert.deepStrictEqual(revived, nativeHost.badges[0]);
	});
});
