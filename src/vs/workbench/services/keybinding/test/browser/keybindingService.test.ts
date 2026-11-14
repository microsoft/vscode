/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileContent } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IKeyboardLayoutService } from '../../../../../platform/keyboardLayout/common/keyboardLayout.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { IHostService } from '../../../host/browser/host.js';
import { UserDataProfileService } from '../../../userDataProfile/common/userDataProfileService.js';
import { UserKeybindings, WorkbenchKeybindingService } from '../../browser/keybindingService.js';
import { FallbackKeyboardMapper } from '../../common/fallbackKeyboardMapper.js';

class DelayedReadFileService extends FileService {
	private delayedRead: { started: DeferredPromise<void>; release: DeferredPromise<void> } | undefined;

	delayNextRead() {
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		this.delayedRead = { started, release };
		return { started: started.p, release: () => release.complete() };
	}

	override async readFile(...args: Parameters<FileService['readFile']>): Promise<IFileContent> {
		const delay = this.delayedRead;
		this.delayedRead = undefined;
		try {
			return await super.readFile(...args);
		} finally {
			if (delay) {
				delay.started.complete();
				await delay.release.p;
			}
		}
	}
}

suite('WorkbenchKeybindingService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createServices() {
		const store = disposables.add(new DisposableStore());
		const logService = new NullLogService();
		const fileService = store.add(new DelayedReadFileService(logService));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider('keybinding-test', provider));
		const location = URI.parse('keybinding-test:/profile');
		const profileService = store.add(new UserDataProfileService(toUserDataProfile('test', 'Test', location, location)));
		const resource = profileService.currentProfile.keybindingsResource;
		const uriIdentityService = store.add(new UriIdentityService(fileService));
		return { store, logService, fileService, profileService, resource, uriIdentityService };
	}

	test('a delayed read from the previous profile does not replace current keybindings', () => runWithFakedTimers({}, async () => {
		const { store, logService, fileService, profileService, resource, uriIdentityService } = createServices();
		await fileService.writeFile(resource, VSBuffer.fromString(JSON.stringify([
			{ key: 'f8', command: 'workbench.action.toggleSidebarVisibility' }
		])));
		const delayedRead = fileService.delayNextRead();
		const executed: string[] = [];
		const service = store.add(new WorkbenchKeybindingService(
			store.add(new ContextKeyService(new TestConfigurationService())),
			new class extends mock<ICommandService>() {
				override async executeCommand<T>(commandId: string): Promise<T | undefined> {
					executed.push(commandId);
					return undefined;
				}
			},
			NullTelemetryService,
			new TestNotificationService(),
			profileService,
			new class extends mock<IHostService>() { },
			new class extends mock<IExtensionService>() {
				override readonly onDidRegisterExtensions = Event.None;
			},
			fileService,
			uriIdentityService,
			logService,
			new class extends mock<IKeyboardLayoutService>() {
				override readonly onDidChangeKeyboardLayout = Event.None;
				override getKeyboardMapper() { return new FallbackKeyboardMapper(false, OS); }
				override validateCurrentKeyboardMapping() { }
			}
		));
		await delayedRead.started;

		const nextProfile = toUserDataProfile('next', 'Next', URI.parse('keybinding-test:/next-profile'), URI.parse('keybinding-test:/cache'));
		await fileService.writeFile(nextProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([
			{ key: 'f8', command: 'workbench.action.togglePanel' }
		])));
		const updated = Event.toPromise(service.onDidUpdateKeybindings, store);
		await profileService.updateCurrentProfile(nextProfile);
		await updated;
		const key = new StandardKeyboardEvent(new KeyboardEvent('keydown', { key: 'F8', code: 'F8', keyCode: 119 }));
		service.dispatchEvent(key, mainWindow.document.body);

		const initialized = Event.toPromise(service.onDidUpdateKeybindings, store);
		await delayedRead.release();
		await initialized;
		service.dispatchEvent(key, mainWindow.document.body);

		assert.deepStrictEqual(executed, ['workbench.action.togglePanel', 'workbench.action.togglePanel']);
	}));

	suite('UserKeybindings', () => {
		test('a delayed reload does not replace a newer reload', () => runWithFakedTimers({}, async () => {
			const { store, logService, fileService, profileService, resource, uriIdentityService } = createServices();
			const keybindings = store.add(new UserKeybindings(profileService, uriIdentityService, fileService, logService));
			await keybindings.initialize();

			const delayedRead = fileService.delayNextRead();
			await fileService.writeFile(resource, VSBuffer.fromString(JSON.stringify([
				{ key: 'f8', command: 'workbench.action.toggleSidebarVisibility' }
			])));
			await delayedRead.started;

			const changed = Event.toPromise(keybindings.onDidChange, store);
			await fileService.writeFile(resource, VSBuffer.fromString(JSON.stringify([
				{ key: 'f8', command: 'workbench.action.togglePanel' }
			])));
			await changed;
			await delayedRead.release();
			await timeout(0);

			assert.deepStrictEqual(keybindings.keybindings.map(binding => binding.command), ['workbench.action.togglePanel']);
		}));

		test('a delayed missing-file read does not clear newer user keybindings', () => runWithFakedTimers({}, async () => {
			const { store, logService, fileService, profileService, resource, uriIdentityService } = createServices();
			const keybindings = store.add(new UserKeybindings(profileService, uriIdentityService, fileService, logService));
			const delayedRead = fileService.delayNextRead();
			const initialized = keybindings.initialize();
			await delayedRead.started;

			const changed = Event.toPromise(keybindings.onDidChange, store);
			await fileService.writeFile(resource, VSBuffer.fromString(JSON.stringify([
				{ key: 'f8', command: 'workbench.action.togglePanel' }
			])));
			await changed;
			await delayedRead.release();
			await initialized;

			assert.deepStrictEqual(keybindings.keybindings.map(binding => binding.command), ['workbench.action.togglePanel']);
		}));

		test('a delayed initial read does not restore cleared user keybindings', () => runWithFakedTimers({}, async () => {
			const { store, logService, fileService, profileService, resource, uriIdentityService } = createServices();
			await fileService.writeFile(resource, VSBuffer.fromString(JSON.stringify([
				{ key: 'f8', command: 'workbench.action.toggleSidebarVisibility' }
			])));
			const keybindings = store.add(new UserKeybindings(profileService, uriIdentityService, fileService, logService));
			const delayedRead = fileService.delayNextRead();
			const initialized = keybindings.initialize();
			await delayedRead.started;

			const latestRead = fileService.delayNextRead();
			await fileService.writeFile(resource, VSBuffer.fromString('[]'));
			await latestRead.started;
			await latestRead.release();
			await timeout(0);
			await delayedRead.release();
			await initialized;

			assert.deepStrictEqual(keybindings.keybindings, []);
		}));

		test('sequential edits still update user keybindings', () => runWithFakedTimers({}, async () => {
			const { store, logService, fileService, profileService, resource, uriIdentityService } = createServices();
			const keybindings = store.add(new UserKeybindings(profileService, uriIdentityService, fileService, logService));
			await keybindings.initialize();
			const commands = ['workbench.action.togglePanel', 'workbench.action.toggleSidebarVisibility'];
			const observed: (string | null)[] = [];
			for (const command of commands) {
				const changed = Event.toPromise(keybindings.onDidChange, store);
				await fileService.writeFile(resource, VSBuffer.fromString(JSON.stringify([{ key: 'f8', command }])));
				await changed;
				observed.push(keybindings.keybindings[0].command);
			}
			assert.deepStrictEqual(observed, commands);
		}));
	});
});
