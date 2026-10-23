/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDialogService, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, toWorkspaceIdentifier, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IWorkspacesService } from '../../../../../platform/workspaces/common/workspaces.js';
import { IWorkbenchConfigurationService } from '../../../configuration/common/configuration.js';
import { IJSONEditingService } from '../../../configuration/common/jsonEditing.js';
import { INativeWorkbenchEnvironmentService } from '../../../environment/electron-browser/environmentService.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { IHostService } from '../../../host/browser/host.js';
import { ILifecycleService } from '../../../lifecycle/common/lifecycle.js';
import { ITextFileService } from '../../../textfile/common/textfiles.js';
import { IUserDataProfileService } from '../../../userDataProfile/common/userDataProfile.js';
import { IWorkingCopyBackupService } from '../../../workingCopy/common/workingCopyBackup.js';
import { WorkingCopyBackupService } from '../../../workingCopy/common/workingCopyBackupService.js';
import { NativeWorkspaceEditingService } from '../../electron-browser/workspaceEditingService.js';

suite('NativeWorkspaceEditingService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const remoteAuthority = 'ssh-remote+test';
	const remoteFolder = URI.from({ scheme: Schemas.vscodeRemote, authority: remoteAuthority, path: '/first' });
	const additionalFolder = remoteFolder.with({ path: '/second' });
	const workspace = { id: 'new-workspace', configPath: URI.file('/workspaces/untitled.code-workspace') };
	const backupPath = URI.file('/backups/new-workspace');

	async function createService(remote: boolean, options: { empty?: boolean; veto?: boolean; initializeError?: Error } = {}) {
		const calls: { operation: string; data?: object }[] = [];
		let hostsRunning = true;
		const folder = remote ? remoteFolder : URI.file('/first');
		const oldWorkspace = options.empty ? testWorkspace() : testWorkspace(folder);
		const settingsResource = URI.joinPath(folder, 'settings.json');
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const provider = disposables.add(new class extends InMemoryFileSystemProvider {
			override async readFile(resource: URI): Promise<Uint8Array> {
				if (remote && !hostsRunning) {
					throw new Error('Remote connection closed when the local extension host stopped');
				}
				return super.readFile(resource);
			}
		}());
		disposables.add(fileService.registerProvider(folder.scheme, provider));
		await fileService.writeFile(settingsResource, VSBuffer.fromString('{}'));

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IUriIdentityService, disposables.add(new UriIdentityService(fileService)));
		instantiationService.stub(IWorkspaceContextService, {
			getWorkspace: () => oldWorkspace,
			getWorkbenchState: () => options.empty ? WorkbenchState.EMPTY : WorkbenchState.FOLDER
		});
		instantiationService.stub(INativeWorkbenchEnvironmentService, {
			remoteAuthority: remote ? remoteAuthority : undefined,
			userRoamingDataHome: URI.file('/userdata')
		});
		instantiationService.stub(IExtensionService, {
			stopExtensionHosts: async () => {
				calls.push({ operation: 'stop' });
				if (options.veto) {
					return false;
				}
				hostsRunning = false;
				return true;
			},
			startExtensionHosts: async () => {
				calls.push({ operation: 'start' });
				hostsRunning = true;
			}
		});
		instantiationService.stub(IWorkbenchConfigurationService, {
			keys: () => ({ default: [], policy: [], user: [], workspace: [], workspaceFolder: [] }),
			initialize: async identifier => {
				calls.push({ operation: 'initialize', data: identifier });
				await fileService.readFile(settingsResource);
				if (options.initializeError) {
					throw options.initializeError;
				}
			}
		});
		instantiationService.stub(IJSONEditingService, {
			write: async (resource, values, save) => {
				calls.push({ operation: 'migrateSettings', data: { resource, values, save } });
			}
		});
		instantiationService.stub(IWorkspacesService, {
			createUntitledWorkspace: async (folders, authority) => {
				calls.push({ operation: 'create', data: { folders, authority } });
				return workspace;
			},
			getWorkspaceIdentifier: async () => workspace,
			enterWorkspace: async resource => {
				calls.push({ operation: 'enter', data: resource });
				return { workspace, backupPath: backupPath.fsPath };
			}
		});
		instantiationService.stub(IStorageService, {
			switch: async (identifier, preserveData) => {
				calls.push({ operation: 'storage', data: { identifier, preserveData } });
			}
		});
		instantiationService.stub(IWorkingCopyBackupService, disposables.add(new class extends WorkingCopyBackupService {
			override reinitialize(home: URI | undefined): void {
				calls.push({ operation: 'backups', data: { home: home?.toString() } });
				super.reinitialize(home);
			}
		}(undefined, fileService, logService)));
		instantiationService.stub(IHostService, {
			reload: async () => { calls.push({ operation: 'reload' }); }
		});
		instantiationService.stub(ILifecycleService, { onBeforeShutdown: Event.None });
		instantiationService.stub(IUserDataProfileService, { currentProfile: upcastPartial<IUserDataProfile>({ isDefault: true }) });
		instantiationService.stub(INativeHostService, {});
		instantiationService.stub(INotificationService, {});
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(ITextFileService, {});
		instantiationService.stub(IFileDialogService, {});
		instantiationService.stub(IDialogService, {});
		instantiationService.stub(ILabelService, {});
		instantiationService.stub(IWorkspaceTrustManagementService, {});
		instantiationService.stub(IUserDataProfilesService, {});

		const service = disposables.add(instantiationService.createInstance(NativeWorkspaceEditingService));
		disposables.add(service.onDidEnterWorkspace(event => {
			calls.push({ operation: 'participant', data: { oldWorkspace: event.oldWorkspace, newWorkspace: event.newWorkspace } });
			event.join((async () => {
				await fileService.readFile(settingsResource);
				calls.push({ operation: 'participantComplete' });
			})());
		}));

		return { service, calls, oldWorkspace, readSettings: () => fileService.readFile(settingsResource) };
	}

	test('adding a second remote folder keeps the connection alive through migration and participants before reloading', async () => {
		const { service, calls, oldWorkspace } = await createService(true);

		await service.addFolders([{ uri: additionalFolder }]);

		assert.deepStrictEqual(calls, [
			{ operation: 'create', data: { folders: [{ uri: remoteFolder }, { uri: additionalFolder, name: undefined }], authority: remoteAuthority } },
			{ operation: 'migrateSettings', data: { resource: workspace.configPath, values: [{ path: ['settings'], value: {} }], save: true } },
			{ operation: 'initialize', data: workspace },
			{ operation: 'enter', data: workspace.configPath },
			{ operation: 'storage', data: { identifier: workspace, preserveData: true } },
			{ operation: 'backups', data: { home: backupPath.toString() } },
			{ operation: 'participant', data: { oldWorkspace: toWorkspaceIdentifier(oldWorkspace), newWorkspace: workspace } },
			{ operation: 'participantComplete' },
			{ operation: 'reload' }
		]);
	});

	test('adding the first remote folder to an empty workspace keeps the connection alive until reload', async () => {
		const { service, calls } = await createService(true, { empty: true });

		await service.addFolders([{ uri: remoteFolder }]);

		assert.deepStrictEqual({ creation: calls[0], operations: calls.map(call => call.operation) }, {
			creation: { operation: 'create', data: { folders: [{ uri: remoteFolder, name: undefined }], authority: remoteAuthority } },
			operations: ['create', 'initialize', 'enter', 'storage', 'backups', 'participant', 'participantComplete', 'reload']
		});
	});

	test('a veto prevents a local workspace transition', async () => {
		const { service, calls } = await createService(false, { veto: true });

		await service.enterWorkspace(workspace.configPath);

		assert.deepStrictEqual(calls, [{ operation: 'stop' }]);
	});

	test('a local workspace transition stops and restarts extension hosts without reloading', async () => {
		const { service, calls } = await createService(false);

		await service.enterWorkspace(workspace.configPath);

		assert.deepStrictEqual(calls.map(call => call.operation), [
			'stop', 'migrateSettings', 'initialize', 'enter', 'storage', 'backups', 'participant', 'participantComplete', 'start'
		]);
	});

	test('a failed remote workspace transition leaves the connection usable without reloading', async () => {
		const error = new Error('Workspace initialization failed');
		const { service, calls, readSettings } = await createService(true, { initializeError: error });

		await assert.rejects(service.enterWorkspace(workspace.configPath), error);
		const settings = await readSettings();

		assert.deepStrictEqual({ operations: calls.map(call => call.operation), settings: settings.value.toString() }, {
			operations: ['migrateSettings', 'initialize'],
			settings: '{}'
		});
	});
});
