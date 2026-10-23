/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { CHAT_WINDOWS_ENABLED_SETTING, IChatWindow, IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatWindowsRestoration, OPEN_CHAT_WINDOWS_STORAGE_KEY } from '../../browser/openChatInWindow.js';

class TestStorageService extends InMemoryStorageService {
	willSave(): void {
		this.emitWillSaveState(WillSaveStateReason.NONE);
	}
}

suite('ChatWindowsRestoration', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const stored = JSON.stringify([{ session: 'test:/session' }]);

	function createRestoration(options: { enabled: boolean; hidden?: boolean }) {
		const storageService = disposables.add(new TestStorageService());
		storageService.store(OPEN_CHAT_WINDOWS_STORAGE_KEY, stored, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const configurationService = new TestConfigurationService({ [CHAT_WINDOWS_ENABLED_SETTING]: options.enabled });
		const restoreComplete = observableValue('restoreComplete', false);
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override windows: IObservable<readonly IChatWindow[]> = observableValue('windows', []);
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override initialRestoreComplete = restoreComplete;
		}());
		const onDidChangeSessions = disposables.add(new Emitter<ISessionsChangeEvent>());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override onDidChangeSessions = onDidChangeSessions.event;
		}());
		instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override sentiment = { hidden: !!options.hidden } as IChatEntitlementService['sentiment'];
		}());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationService, configurationService);
		const restoration = disposables.add(instantiationService.createInstance(ChatWindowsRestoration));
		return { storageService, restoration, onDidChangeSessions };
	}

	test('keeps the stored chat windows while their restoration is pending', () => {
		const { storageService } = createRestoration({ enabled: true });

		storageService.willSave();

		assert.strictEqual(storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE), stored);
	});

	test('keeps the stored chat windows when chat windows are disabled', () => {
		const { storageService } = createRestoration({ enabled: false });

		storageService.willSave();

		assert.strictEqual(storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE), stored);
	});

	test('keeps the stored chat windows when AI features are hidden', () => {
		const { storageService } = createRestoration({ enabled: true, hidden: true });

		storageService.willSave();

		assert.strictEqual(storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE), stored);
	});

	test('forgets the stored chat window of a removed session', () => {
		const { storageService, onDidChangeSessions } = createRestoration({ enabled: false });
		storageService.store(OPEN_CHAT_WINDOWS_STORAGE_KEY, JSON.stringify([{ session: 'test:/session' }, { session: 'test:/other' }]), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		onDidChangeSessions.fire({ added: [], changed: [], removed: [{ resource: URI.parse('test:/session') } as ISession] });
		assert.deepStrictEqual(JSON.parse(storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE)!), [{ session: 'test:/other' }]);

		onDidChangeSessions.fire({ added: [], changed: [], removed: [{ resource: URI.parse('test:/other') } as ISession] });
		assert.strictEqual(storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE), undefined);
	});
});
