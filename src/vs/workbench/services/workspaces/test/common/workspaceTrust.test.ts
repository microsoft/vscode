/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promiseWithResolvers } from '../../../../../base/common/async.js';
import { sep } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IRemoteAuthorityResolverService, ResolverResult } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustInfo } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { Workspace, testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { Memento } from '../../../../common/memento.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { WorkspaceTrustEnablementService, WorkspaceTrustManagementService, WORKSPACE_TRUST_STORAGE_KEY } from '../../common/workspaceTrust.js';
import { AGENT_HOST_SCHEME } from '../../../../../platform/agentHost/common/agentHostUri.js';
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

		test('trust folders passed via --trust-folder', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));

			const folder = URI.file('/trusted-from-cli');
			environmentService.trustedFolders = [folder.fsPath];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(testWorkspace(folder));
			const testObject = await initializeTestObject();

			assert.strictEqual(true, testObject.isWorkspaceTrusted());
			assert.strictEqual(true, (await testObject.getUriTrustInfo(folder)).trusted);
		});

		test('trust folders passed via --trust-folder (subfolder is trusted)', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));

			const parent = URI.file('/trusted-parent');
			environmentService.trustedFolders = [parent.fsPath];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(testWorkspace(URI.file('/trusted-parent/child')));
			const testObject = await initializeTestObject();

			assert.strictEqual(true, testObject.isWorkspaceTrusted());
		});

		test('trust folder passed via --trust-folder with a trailing separator', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));

			const folder = URI.file('/trusted-trailing-separator');
			environmentService.trustedFolders = [`${folder.fsPath}${sep}`];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(testWorkspace(folder));
			const testObject = await initializeTestObject();

			assert.deepStrictEqual({
				workspaceTrusted: testObject.isWorkspaceTrusted(),
				trustedUris: testObject.getTrustedUris().map(uri => uri.toString())
			}, {
				workspaceTrusted: true,
				trustedUris: [folder.toString()]
			});
		});

		test('trust multiple folders passed via --trust-folder', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));

			const a = URI.file('/cli-a');
			const b = URI.file('/cli-b');
			environmentService.trustedFolders = [a.fsPath, b.fsPath];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(testWorkspace(a));
			const testObject = await initializeTestObject();

			assert.strictEqual(true, (await testObject.getUriTrustInfo(a)).trusted);
			assert.strictEqual(true, (await testObject.getUriTrustInfo(b)).trusted);
		});

		test('trusts a multi-root workspace when --trust-folder covers all roots', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));

			const rootA = URI.file('/multi-a');
			const rootB = URI.file('/multi-b');
			environmentService.trustedFolders = [rootA.fsPath, rootB.fsPath];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(testWorkspace(rootA, rootB));
			const testObject = await initializeTestObject();

			assert.strictEqual(true, testObject.isWorkspaceTrusted());
		});

		test('does not trust a multi-root workspace when --trust-folder covers only some roots', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));

			const rootA = URI.file('/multi-a');
			const rootB = URI.file('/multi-b');
			environmentService.trustedFolders = [rootA.fsPath];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(testWorkspace(rootA, rootB));
			const testObject = await initializeTestObject();

			assert.strictEqual(false, testObject.isWorkspaceTrusted());
			assert.strictEqual(true, (await testObject.getUriTrustInfo(rootA)).trusted);
			assert.strictEqual(false, (await testObject.getUriTrustInfo(rootB)).trusted);
		});

		test('trusts a remote (vscode-remote://) folder passed via --trust-folder', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));

			const remoteAuthority = 'test+auth';
			const remoteFolder = URI.parse(`vscode-remote://${remoteAuthority}/home/me/proj`);

			environmentService.remoteAuthority = remoteAuthority;
			environmentService.trustedFolders = [`vscode-remote://${remoteAuthority}/home/me/proj`];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			// Trust must come from `--trust-folder` rather than the remote resolver.
			instantiationService.stub(IRemoteAuthorityResolverService, new class extends mock<IRemoteAuthorityResolverService>() {
				override async resolveAuthority(authority: string): Promise<ResolverResult> {
					return { authority: { authority } } as unknown as ResolverResult;
				}
				override async getCanonicalURI(uri: URI): Promise<URI> {
					return uri;
				}
			});

			workspaceService.setWorkspace(testWorkspace(remoteFolder));
			const testObject = await initializeTestObject();

			assert.strictEqual(true, testObject.isWorkspaceTrusted());
			assert.strictEqual(true, (await testObject.getUriTrustInfo(remoteFolder)).trusted);
		});

		test('a --trust-folder value that fails to resolve does not discard the others', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));

			const remoteAuthority = 'test+auth';
			const good = URI.file('/good-cli');
			environmentService.remoteAuthority = remoteAuthority;
			environmentService.trustedFolders = [`vscode-remote://${remoteAuthority}/home/me/bad`, good.fsPath];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			// A rejected remote URI must not discard the valid file entry.
			instantiationService.stub(IRemoteAuthorityResolverService, new class extends mock<IRemoteAuthorityResolverService>() {
				override async resolveAuthority(authority: string): Promise<ResolverResult> {
					return { authority: { authority } } as unknown as ResolverResult;
				}
				override async getCanonicalURI(): Promise<URI> {
					throw new Error('cannot resolve');
				}
			});

			workspaceService.setWorkspace(testWorkspace(good));
			const testObject = await initializeTestObject();

			assert.strictEqual(true, (await testObject.getUriTrustInfo(good)).trusted);
		});

		test('folders passed via --trust-folder persist across reloads', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));

			const folder = URI.file('/trusted-persist');
			environmentService.trustedFolders = [folder.fsPath];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(testWorkspace(folder));
			await initializeTestObject();

			// The persisted entry must survive a launch without the flag.
			environmentService.trustedFolders = [];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });
			const reloaded = await initializeTestObject();

			assert.strictEqual(true, reloaded.isWorkspaceTrusted());
			assert.strictEqual(true, (await reloaded.getUriTrustInfo(folder)).trusted);
		});

		test('workspace trust initialization waits for the --trust-folder transition', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));

			const folder = URI.file('/trusted-transition');
			environmentService.trustedFolders = [folder.fsPath];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });
			workspaceService.setWorkspace(testWorkspace(folder));

			const testObject = store.add(instantiationService.createInstance(WorkspaceTrustManagementService));
			const { promise: transitionStarted, resolve: markTransitionStarted } = promiseWithResolvers<void>();
			const { promise: continueTransition, resolve: releaseTransition } = promiseWithResolvers<void>();
			store.add(testObject.addWorkspaceTrustTransitionParticipant({
				async participate(): Promise<void> {
					markTransitionStarted();
					await continueTransition;
				}
			}));

			let initialized = false;
			testObject.workspaceTrustInitialized.then(() => initialized = true);
			try {
				await transitionStarted;
				assert.strictEqual(initialized, false);
			} finally {
				releaseTransition();
				await testObject.workspaceTrustInitialized;
			}
		});

		test('an empty --trust-folder list trusts nothing', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));

			environmentService.trustedFolders = [];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(testWorkspace(URI.file('/not-trusted')));
			const testObject = await initializeTestObject();

			assert.strictEqual(false, testObject.isWorkspaceTrusted());
			assert.strictEqual(0, testObject.getTrustedUris().length);
		});

		test('a malformed --trust-folder value is ignored but valid ones are trusted', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));

			const valid = URI.file('/valid-cli');
			// The first value has an illegal URI scheme (URI.parse throws) and is skipped.
			environmentService.trustedFolders = ['bad scheme://x', valid.fsPath];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(testWorkspace(valid));
			const testObject = await initializeTestObject();

			assert.strictEqual(true, (await testObject.getUriTrustInfo(valid)).trusted);
			assert.strictEqual(1, testObject.getTrustedUris().length);
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
