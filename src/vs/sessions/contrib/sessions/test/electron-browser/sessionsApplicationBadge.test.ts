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
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { BlockedSessions } from '../../../blockedSessions/browser/blockedSessions.js';
import { SESSIONS_APPLICATION_BADGE_SETTING, SessionsApplicationBadge } from '../../electron-browser/sessionsApplicationBadge.js';

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

	private readonly _blockedSessions = observableValue<readonly ISession[]>('blockedSessions', []);
	override readonly blockedSessions = this._blockedSessions;

	setSessions(sessions: readonly ISession[]): void {
		this._blockedSessions.set(sessions, undefined);
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

	function createBadge(sessions: ISession[], enabled = true) {
		const management = store.add(new TestSessionsManagementService());
		management.sessions.push(...sessions);

		const nativeHost = new TestNativeHostService();
		const configuration = new TestConfigurationService({ [SESSIONS_APPLICATION_BADGE_SETTING]: enabled });
		const blockedSessions = new TestBlockedSessions();
		blockedSessions.setSessions(sessions.filter(session => !session.isArchived.get() && session.status.get() === SessionStatus.NeedsInput));
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stubInstance(BlockedSessions, blockedSessions);

		store.add(new SessionsApplicationBadge(management, nativeHost, configuration, new TestThemeService(), instantiationService));

		return { management, nativeHost, configuration, blockedSessions };
	}

	function badgeCounts(nativeHost: TestNativeHostService): (number | undefined)[] {
		return nativeHost.badges.map(badge => badge?.count);
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
		]);

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
		const { nativeHost, blockedSessions } = createBadge([failingCI.session]);

		blockedSessions.setSessions([failingCI.session]);

		assert.deepStrictEqual(nativeHost.badges.map(badge => ({ count: badge?.count, description: badge?.description })), [
			{ count: 1, description: '1 session needs your attention' }
		]);
	});

	test('is off until enabled', () => {
		const { nativeHost, configuration } = createBadge([createSession('unread', { isRead: false }).session], false);

		configuration.setUserConfiguration(SESSIONS_APPLICATION_BADGE_SETTING, true);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration() { return true; }
		});

		// No badge is pushed while disabled, so a second Agents window cannot
		// clear the application wide badge of the first one on startup.
		assert.deepStrictEqual(nativeHost.badges.map(badge => ({ count: badge?.count, description: badge?.description })), [
			{ count: 1, description: '1 session needs your attention' }
		]);
	});

	test('follows session state and session list changes', () => {
		const unread = createSession('unread', { isRead: false });
		const { nativeHost, management, blockedSessions } = createBadge([unread.session]);

		unread.isRead.set(true, undefined);

		const added = createSession('added', { status: SessionStatus.NeedsInput });
		management.sessions.push(added.session);
		management.change();
		blockedSessions.setSessions([added.session]);

		added.isArchived.set(true, undefined);

		assert.deepStrictEqual(badgeCounts(nativeHost), [1, undefined, 1, undefined]);
	});

	test('badge survives the IPC round trip to the main process', () => {
		const { nativeHost } = createBadge([createSession('unread', { isRead: false }).session]);

		// The badge crosses a `ProxyChannel` as plain JSON: a nested `VSBuffer`
		// is not revived, and an `undefined` valued property is dropped
		// entirely. Both would make the main process see a different badge.
		const writer = new BufferWriter();
		serialize(writer, [nativeHost.badges[0]]);
		const [revived] = deserialize(new BufferReader(writer.buffer)) as [IApplicationBadge];

		assert.deepStrictEqual(revived, nativeHost.badges[0]);
	});
});
