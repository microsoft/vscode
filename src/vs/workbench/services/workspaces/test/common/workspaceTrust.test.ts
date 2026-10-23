/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IRemoteAuthorityResolverService, WebSocketRemoteConnection } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustInfo, IWorkspaceTrustManagementService, WorkspaceTrustUriResponse } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { Memento } from '../../../../common/memento.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { WorkspaceTrustEnablementService, WorkspaceTrustManagementService, WorkspaceTrustRequestService, WORKSPACE_TRUST_STORAGE_KEY } from '../../common/workspaceTrust.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { TestContextService, TestStorageService, TestWorkspaceTrustEnablementService } from '../../../../test/common/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Mutable } from '../../../../../base/common/types.js';

suite('Workspace Trust', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let environmentService: Mutable<IWorkbenchEnvironmentService>;

	setup(async () => {
		instantiationService = store.add(new TestInstantiationService());

		configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);

		environmentService = {} as IWorkbenchEnvironmentService;
		instantiationService.stub(IWorkbenchEnvironmentService, environmentService);

		const fileService = store.add(new FileService(new NullLogService()));
		const uriIdentityService = store.add(new UriIdentityService(fileService));

		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IUriIdentityService, uriIdentityService);
		instantiationService.stub(IRemoteAuthorityResolverService, new class extends mock<IRemoteAuthorityResolverService>() { });
	});

	suite('Enablement', () => {
		test('workspace trust enabled', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			const testObject = store.add(instantiationService.createInstance(WorkspaceTrustEnablementService));

			assert.strictEqual(testObject.isWorkspaceTrustEnabled(), true);
		});

		test('workspace trust disabled (user setting)', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(false, true));
			const testObject = store.add(instantiationService.createInstance(WorkspaceTrustEnablementService));

			assert.strictEqual(testObject.isWorkspaceTrustEnabled(), false);
		});

		test('workspace trust disabled (--disable-workspace-trust)', () => {
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService, disableWorkspaceTrust: true });
			const testObject = store.add(instantiationService.createInstance(WorkspaceTrustEnablementService));

			assert.strictEqual(testObject.isWorkspaceTrustEnabled(), false);
		});
	});

	suite('Management', () => {
		let storageService: TestStorageService;
		let workspaceService: TestContextService;

		teardown(() => {
			Memento.clear(StorageScope.WORKSPACE);
		});

		setup(() => {
			storageService = store.add(new TestStorageService());
			instantiationService.stub(IStorageService, storageService);

			workspaceService = new TestContextService();
			instantiationService.stub(IWorkspaceContextService, workspaceService);

			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());
		});

		test('empty workspace - trusted', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			const testObject = await initializeTestObject();

			assert.strictEqual(true, testObject.isWorkspaceTrusted());
		});

		test('empty workspace - untrusted', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));
			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			const testObject = await initializeTestObject();

			assert.strictEqual(false, testObject.isWorkspaceTrusted());
		});

		test('empty workspace - trusted, open trusted file', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			const trustInfo: IWorkspaceTrustInfo = { uriTrustInfo: [{ uri: URI.parse('file:///Folder'), trusted: true }] };
			storageService.store(WORKSPACE_TRUST_STORAGE_KEY, JSON.stringify(trustInfo), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);

			environmentService.filesToOpenOrCreate = [{ fileUri: URI.parse('file:///Folder/file.txt') }];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			const testObject = await initializeTestObject();

			assert.strictEqual(true, testObject.isWorkspaceTrusted());
		});

		test('empty workspace - trusted, open untrusted file', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));

			environmentService.filesToOpenOrCreate = [{ fileUri: URI.parse('file:///Folder/foo.txt') }];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			const testObject = await initializeTestObject();

			assert.strictEqual(false, testObject.isWorkspaceTrusted());
		});

		test('remote workspace does not inherit trust through backslash traversal', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			const root = URI.from({ scheme: Schemas.vscodeRemote, authority: 'host', path: '/c:/lab/ws' });
			const workspaceUri = URI.parse(`${root.toString()}/..%5Cevilfolder`);
			environmentService.remoteAuthority = root.authority;
			store.add(instantiationService.get(IFileService).registerProvider(Schemas.vscodeRemote, store.add(new InMemoryFileSystemProvider())));
			instantiationService.stub(IRemoteAuthorityResolverService, {
				getCanonicalURI: async uri => uri,
				resolveAuthority: async authority => ({
					authority: { authority, connectTo: new WebSocketRemoteConnection('localhost', 0), connectionToken: undefined }
				}),
			});
			workspaceService.setWorkspace(new Workspace('remote-workspace', [toWorkspaceFolder(workspaceUri)]));
			const testObject = await initializeTestObject();
			await testObject.workspaceResolved;
			await testObject.setUrisTrust([root], true);

			const uris = [
				workspaceUri,
				URI.parse(`${root.toString()}/../evilfolder`),
				root.with({ path: '/c:/lab/evilfolder' }),
				URI.parse(`${root.toString()}/child`),
			];
			const trustInfo = await Promise.all(uris.map(uri => testObject.getUriTrustInfo(uri)));
			assert.deepStrictEqual({
				workspaceTrusted: testObject.isWorkspaceTrusted(),
				uriTrust: trustInfo.map(info => info.trusted),
			}, {
				workspaceTrusted: false,
				uriTrust: [false, false, false, true],
			});
		});

		for (const canonicalDrive of ['C', 'c']) {
			test(`remote Windows workspace recognizes persisted trust with canonical drive ${canonicalDrive}:`, async () => {
				await configurationService.setUserConfiguration('security', getUserSettings(true, true));
				const folder = URI.from({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+windows-host', path: '/C:/repos/vscode' });
				const canonicalFolder = folder.with({ path: `/${canonicalDrive}:/repos/vscode` });
				const savedFolder = folder.with({ path: canonicalDrive === 'C' ? '/c:/repos/vscode' : '/C:/repos/vscode' });
				environmentService.remoteAuthority = folder.authority;
				store.add(instantiationService.get(IFileService).registerProvider(Schemas.vscodeRemote, store.add(new InMemoryFileSystemProvider())));
				instantiationService.stub(IRemoteAuthorityResolverService, {
					getCanonicalURI: async uri => uri.with({ path: uri.path.replace(/^\/[Cc]:/, `/${canonicalDrive}:`) }),
					resolveAuthority: async authority => ({
						authority: { authority, connectTo: new WebSocketRemoteConnection('localhost', 0), connectionToken: undefined }
					}),
				});
				workspaceService.setWorkspace(new Workspace('remote-workspace', [toWorkspaceFolder(folder)]));
				const trustInfo: IWorkspaceTrustInfo = { uriTrustInfo: [{ uri: savedFolder, trusted: true }] };
				storageService.store(WORKSPACE_TRUST_STORAGE_KEY, JSON.stringify(trustInfo), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
				const testObject = await initializeTestObject();
				await testObject.workspaceResolved;
				const uris = [
					folder,
					canonicalFolder,
					URI.joinPath(canonicalFolder, 'src'),
					canonicalFolder.with({ authority: 'ssh-remote+other-host' }),
					canonicalFolder.with({ path: `/${canonicalDrive}:/repos/vscode-other` }),
					canonicalFolder.with({ path: `/${canonicalDrive}:/repos/VSCode` }),
				];

				assert.deepStrictEqual({
					workspaceTrusted: testObject.isWorkspaceTrusted(),
					uriTrust: await Promise.all(uris.map(async uri => (await testObject.getUriTrustInfo(uri)).trusted)),
				}, {
					workspaceTrusted: true,
					uriTrust: [true, true, true, false, false, false],
				});
			});
		}

		test('agent host folder is not auto-trusted as a virtual resource', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			const testObject = await initializeTestObject();

			// A regular virtual resource (e.g. github1s) is auto-trusted...
			const virtualUri = URI.parse('vscode-test-virtual://authority/folder');
			assert.strictEqual(true, (await testObject.getUriTrustInfo(virtualUri)).trusted);

			// ...but an agent host folder is not, even though it is a virtual scheme.
			const agentHostUri = URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'my-server', path: '/Users/me/code', query: '_ah=meta' });
			assert.strictEqual(false, (await testObject.getUriTrustInfo(agentHostUri)).trusted);
		});

		test('agent host folder trust persists and ignores the _ah query', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			const testObject = await initializeTestObject();

			const agentHostUri = URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'my-server', path: '/Users/me/code', query: '_ah=meta' });
			await testObject.setUrisTrust([agentHostUri], true);

			// The same folder with a different _ah payload resolves to the same trust entry.
			const sameFolderDifferentMeta = URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'my-server', path: '/Users/me/code', query: '_ah=other' });
			assert.strictEqual(true, (await testObject.getUriTrustInfo(sameFolderDifferentMeta)).trusted);
		});

		test('agent host folder trust does not prompt again after Windows URI serialization', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			const testObject = await initializeTestObject();
			instantiationService.stub(IWorkspaceTrustManagementService, testObject);
			const requests = store.add(instantiationService.createInstance(WorkspaceTrustRequestService));
			const prompts: URI[] = [];
			const completions: Promise<void>[] = [];
			store.add(requests.onDidInitiateResourcesTrustRequest(options => {
				prompts.push(options.uri);
				completions.push(requests.completeResourcesTrustRequest(options.uri, WorkspaceTrustUriResponse.Open));
			}));

			const pickedFolder = toAgentHostUri(URI.from({ scheme: Schemas.file, path: '/C:/repos/vscode' }), 'windows-host');
			const restoredFolder = URI.parse(pickedFolder.toString());
			const results = [
				await requests.requestResourcesTrust({ uri: pickedFolder }),
				await requests.requestResourcesTrust({ uri: restoredFolder }),
				await requests.requestResourcesTrust({ uri: restoredFolder }),
			];
			await Promise.all(completions);
			testObject.dispose();
			const restored = await initializeTestObject();

			assert.deepStrictEqual({
				results,
				promptCount: prompts.length,
				trustedAfterReload: (await restored.getUriTrustInfo(restoredFolder)).trusted,
			}, {
				results: [true, true, true],
				promptCount: 1,
				trustedAfterReload: true,
			});
		});

		test('persisted agent host trust recognizes serialized Windows drive letters', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			const folder = toAgentHostUri(URI.from({ scheme: Schemas.file, path: '/C:/repos/vscode' }), 'windows-host').with({ query: null });
			const trustInfo: IWorkspaceTrustInfo = { uriTrustInfo: [{ uri: folder, trusted: true }] };
			storageService.store(WORKSPACE_TRUST_STORAGE_KEY, JSON.stringify(trustInfo), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
			const testObject = await initializeTestObject();
			const uris = [
				folder,
				folder.with({ path: '/c:/repos/vscode' }),
				folder.with({ path: '/c:/repos/vscode/src' }),
				folder.with({ authority: 'other-host', path: '/c:/repos/vscode' }),
				folder.with({ scheme: Schemas.file, authority: '', path: '/c:/repos/vscode' }),
				folder.with({ path: '/c:/repos/vscode-other' }),
				folder.with({ path: '/d:/repos/vscode' }),
				folder.with({ path: '/c:/repos/vscode/../other' }),
				folder.with({ path: '/c:/repos/vscode/..\\other' }),
			];

			assert.deepStrictEqual(
				await Promise.all(uris.map(async uri => (await testObject.getUriTrustInfo(uri)).trusted)),
				[true, true, true, false, false, false, false, false, false],
			);
		});

		test('agent host Windows trust can be deduplicated and revoked using serialized URIs', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			const testObject = await initializeTestObject();
			const folder = toAgentHostUri(URI.from({ scheme: Schemas.file, path: '/C:/repos/vscode' }), 'windows-host');
			const serializedFolder = URI.parse(folder.toString());
			await testObject.setTrustedUris([folder, serializedFolder]);
			const trusted = (await testObject.getUriTrustInfo(serializedFolder)).trusted;
			const savedPaths = testObject.getTrustedUris().map(uri => uri.path);
			await testObject.setUrisTrust([serializedFolder], false);

			assert.deepStrictEqual({
				trusted,
				savedPaths,
				trustedAfterRevocation: (await testObject.getUriTrustInfo(folder)).trusted,
				remainingTrust: testObject.getTrustedUris(),
			}, {
				trusted: true,
				savedPaths: ['/c:/repos/vscode'],
				trustedAfterRevocation: false,
				remainingTrust: [],
			});
		});

		test('agent host trust preserves case-sensitive folder paths', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			const testObject = await initializeTestObject();
			const folder = toAgentHostUri(URI.from({ scheme: Schemas.file, path: '/home/user/Repo' }), 'linux-host');
			await testObject.setUrisTrust([folder], true);

			assert.deepStrictEqual(
				await Promise.all([
					folder,
					URI.joinPath(folder, 'src'),
					folder.with({ path: '/home/user/repo' }),
					folder.with({ path: '/home/user/repo/src' }),
				].map(async uri => (await testObject.getUriTrustInfo(uri)).trusted)),
				[true, true, false, false],
			);
		});

		for (const authority of ['managed-host', 'host_with_underscore', 'Host42']) {
			test(`registered authorities are automatically trusted without persistence (${authority})`, async () => {
				await configurationService.setUserConfiguration('security', getUserSettings(true, true));
				const folder = toAgentHostUri(URI.file('/workspaces/repo'), authority);
				workspaceService.setWorkspace(new Workspace('managed-workspace', [toWorkspaceFolder(folder)]));
				const testObject = store.add(instantiationService.createInstance(WorkspaceTrustManagementService));
				store.add(testObject.registerTrustedAuthority(AGENT_HOST_SCHEME, authority));
				await testObject.workspaceTrustInitialized;
				instantiationService.stub(IWorkspaceTrustManagementService, testObject);
				const requests = store.add(instantiationService.createInstance(WorkspaceTrustRequestService));

				await testObject.setUrisTrust([folder], true);
				await testObject.setUrisTrust([folder], false);
				const otherRepository = toAgentHostUri(URI.file('/workspaces/other-repo'), authority);
				assert.deepStrictEqual({
					trusted: testObject.isWorkspaceTrusted(),
					forced: testObject.isWorkspaceTrustForced(),
					canSetTrust: testObject.canSetWorkspaceTrust(),
					folderTrusted: (await testObject.getUriTrustInfo(folder)).trusted,
					otherRepositoryTrusted: (await testObject.getUriTrustInfo(otherRepository)).trusted,
					resourceRequest: await requests.requestResourcesTrust({ uri: otherRepository }),
					workspaceRequest: await requests.requestWorkspaceTrust(),
					savedUris: testObject.getTrustedUris(),
					storage: storageService.get(WORKSPACE_TRUST_STORAGE_KEY, StorageScope.APPLICATION_SHARED),
				}, {
					trusted: true,
					forced: true,
					canSetTrust: false,
					folderTrusted: true,
					otherRepositoryTrusted: true,
					resourceRequest: true,
					workspaceRequest: true,
					savedUris: [],
					storage: undefined,
				});
			});
		}

		test('registered authority trust does not extend to other schemes or authorities', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			const managed = toAgentHostUri(URI.file('/workspaces/repo'), 'managed-host');
			const local = URI.file('/workspaces/repo');
			workspaceService.setWorkspace(new Workspace('mixed-workspace', [toWorkspaceFolder(managed), toWorkspaceFolder(local)]));
			const testObject = store.add(instantiationService.createInstance(WorkspaceTrustManagementService));
			store.add(testObject.registerTrustedAuthority(AGENT_HOST_SCHEME, managed.authority));
			await testObject.workspaceTrustInitialized;
			const authorities = ['managed-host-other', 'managed', 'unmanaged-host', 'local'];
			const otherHosts = await Promise.all(authorities.map(authority => testObject.getUriTrustInfo(toAgentHostUri(local, authority))));
			const wrongScheme = await testObject.getUriTrustInfo(managed.with({ scheme: 'file' }));

			assert.deepStrictEqual({
				trusted: testObject.isWorkspaceTrusted(),
				forced: testObject.isWorkspaceTrustForced(),
				canSetTrust: testObject.canSetWorkspaceTrust(),
				managedTrusted: (await testObject.getUriTrustInfo(managed)).trusted,
				otherHostsTrusted: otherHosts.map(info => info.trusted),
				wrongSchemeTrusted: wrongScheme.trusted,
			}, {
				trusted: false,
				forced: false,
				canSetTrust: true,
				managedTrusted: true,
				otherHostsTrusted: authorities.map(() => false),
				wrongSchemeTrusted: false,
			});
		});

		test('authority registration updates workspace trust and lasts until the last registration is disposed', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			const folder = toAgentHostUri(URI.file('/workspaces/repo'), 'managed-host');
			workspaceService.setWorkspace(new Workspace('managed-workspace', [toWorkspaceFolder(folder)]));
			const testObject = await initializeTestObject();
			const changes: boolean[] = [];
			store.add(testObject.onDidChangeTrust(trusted => changes.push(trusted)));
			const trusted = Event.toPromise(testObject.onDidChangeTrust);
			const first = store.add(testObject.registerTrustedAuthority(AGENT_HOST_SCHEME, folder.authority));
			await trusted;
			const second = store.add(testObject.registerTrustedAuthority(AGENT_HOST_SCHEME, folder.authority.toUpperCase()));
			first.dispose();
			const stillTrusted = (await testObject.getUriTrustInfo(folder)).trusted;
			const untrusted = Event.toPromise(testObject.onDidChangeTrust);
			second.dispose();
			await untrusted;

			assert.deepStrictEqual({
				changes,
				stillTrusted,
				folderTrusted: (await testObject.getUriTrustInfo(folder)).trusted,
				workspaceTrusted: testObject.isWorkspaceTrusted(),
				forced: testObject.isWorkspaceTrustForced(),
				canSetTrust: testObject.canSetWorkspaceTrust(),
				savedUris: testObject.getTrustedUris(),
			}, {
				changes: [true, false],
				stillTrusted: true,
				folderTrusted: false,
				workspaceTrusted: false,
				forced: false,
				canSetTrust: true,
				savedUris: [],
			});
		});

		test('setWorkspaceTrust waits for trust transition participants before resolving', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			workspaceService.setWorkspace(new Workspace('folder-workspace', [toWorkspaceFolder(URI.parse('file:///Folder'))]));
			const testObject = await initializeTestObject();

			let releaseParticipant!: () => void;
			const participantCanComplete = new Promise<void>(resolve => releaseParticipant = resolve);

			let participantStartedResolve!: () => void;
			const participantStarted = new Promise<void>(resolve => participantStartedResolve = resolve);

			let participantStartedFlag = false;
			let participantCompleted = false;
			let trustChangeEventFired = false;

			const participantCompletedPromise = new Promise<void>(resolve => {
				store.add(testObject.addWorkspaceTrustTransitionParticipant({
					async participate(trusted: boolean): Promise<void> {
						if (trusted) {
							participantStartedFlag = true;
							participantStartedResolve();
							await participantCanComplete;
							participantCompleted = true;
							resolve();
						}
					}
				}));
			});

			store.add(testObject.onDidChangeTrust(trusted => {
				if (trusted) {
					trustChangeEventFired = true;
				}
			}));

			await testObject.setWorkspaceTrust(false);
			assert.deepStrictEqual({
				trusted: testObject.isWorkspaceTrusted(),
				participantStarted: participantStartedFlag,
				participantCompleted,
				trustChangeEventFired
			}, {
				trusted: false,
				participantStarted: false,
				participantCompleted: false,
				trustChangeEventFired: false
			});

			const setWorkspaceTrustPromise = testObject.setWorkspaceTrust(true);
			let setWorkspaceTrustResolved = false;
			setWorkspaceTrustPromise.then(() => setWorkspaceTrustResolved = true);

			try {
				await participantStarted;
				await Promise.resolve();

				assert.deepStrictEqual({
					setWorkspaceTrustResolved,
					trusted: testObject.isWorkspaceTrusted(),
					participantStarted: participantStartedFlag,
					participantCompleted,
					trustChangeEventFired
				}, {
					setWorkspaceTrustResolved: false,
					trusted: true,
					participantStarted: true,
					participantCompleted: false,
					trustChangeEventFired: false
				});
			} finally {
				releaseParticipant();
				await participantCompletedPromise;
			}

			await setWorkspaceTrustPromise;
			await Promise.resolve();

			assert.deepStrictEqual({
				setWorkspaceTrustResolved,
				trusted: testObject.isWorkspaceTrusted(),
				participantCompleted,
				trustChangeEventFired
			}, {
				setWorkspaceTrustResolved: true,
				trusted: true,
				participantCompleted: true,
				trustChangeEventFired: true
			});
		});

		async function initializeTestObject(): Promise<WorkspaceTrustManagementService> {
			const workspaceTrustManagementService = store.add(instantiationService.createInstance(WorkspaceTrustManagementService));
			await workspaceTrustManagementService.workspaceTrustInitialized;

			return workspaceTrustManagementService;
		}
	});

	function getUserSettings(enabled: boolean, emptyWindow: boolean) {
		return { workspace: { trust: { emptyWindow, enabled } } };
	}
});
