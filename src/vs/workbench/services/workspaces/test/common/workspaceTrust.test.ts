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
import { getSingletonServiceDescriptors } from '../../../../../platform/instantiation/common/extensions.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
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
import { DeferredPromise } from '../../../../../base/common/async.js';
import { ICanonicalUriService } from '../../../../../platform/workspace/common/canonicalUri.js';
import { CanonicalUriService } from '../../common/canonicalUriService.js';
import { encodeHex, VSBuffer } from '../../../../../base/common/buffer.js';
import { INotificationService, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';

suite('Workspace Trust', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let environmentService: Mutable<IWorkbenchEnvironmentService>;
	let canonicalUriService: CanonicalUriService;
	let notifications: NotificationMessage[];

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
		canonicalUriService = store.add(new CanonicalUriService());
		instantiationService.stub(ICanonicalUriService, canonicalUriService);
		instantiationService.stub(ILogService, new NullLogService());
		notifications = [];
		instantiationService.stub(INotificationService, new class extends TestNotificationService {
			override error(error: NotificationMessage) {
				notifications.push(error);
				return super.error(error);
			}
		});
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

		test('workbench startup retains the canonical URI service used by workspace trust', () => {
			const services = new ServiceCollection([ICanonicalUriService, canonicalUriService]);
			for (const [id, descriptor] of getSingletonServiceDescriptors()) {
				services.set(id, descriptor);
			}
			const workbenchInstantiationService = store.add(new InstantiationService(services, true));

			assert.strictEqual(workbenchInstantiationService.invokeFunction(accessor => accessor.get(ICanonicalUriService)), canonicalUriService);
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

		suite('virtual repository source trust', () => {
			const base = URI.from({ scheme: 'vscode-vfs', authority: 'github', path: '/microsoft/project' });
			const fork = base.with({ path: '/fork-owner/project' });
			const pullRequest = base.with({
				authority: `github+${encodeHex(VSBuffer.fromString(JSON.stringify({ v: 1, ref: { type: 3, id: '1887' } })))}`,
			});

			setup(() => {
				workspaceService.setWorkspace(new Workspace('pull-request', [toWorkspaceFolder(pullRequest)]));
				const trustInfo: IWorkspaceTrustInfo = { uriTrustInfo: [{ uri: base, trusted: true }] };
				storageService.store(WORKSPACE_TRUST_STORAGE_KEY, JSON.stringify(trustInfo), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
			});

			function registerSource(source: URI) {
				return store.add(canonicalUriService.registerCanonicalUriProvider({
					scheme: 'vscode-vfs',
					provideCanonicalUri: async uri => source.with({ path: source.path + URI.revive(uri).path.slice(base.path.length) }),
				}));
			}

			test('does not inherit base trust before the source provider is available', async () => {
				const testObject = await initializeTestObject();

				assert.deepStrictEqual({
					trusted: testObject.isWorkspaceTrusted(),
					canTrust: testObject.canSetWorkspaceTrust(),
					baseTrusted: (await testObject.getUriTrustInfo(base)).trusted,
					prTrusted: (await testObject.getUriTrustInfo(pullRequest)).trusted,
				}, {
					trusted: false,
					canTrust: false,
					baseTrusted: true,
					prTrusted: false,
				});
				await assert.rejects(testObject.setWorkspaceTrust(true), /source of this workspace could not be determined/);
			});

			test('an unresolved workspace trust request completes and can be requested again', async () => {
				const testObject = await initializeTestObject();
				instantiationService.stub(IWorkspaceTrustManagementService, testObject);
				const requests = store.add(instantiationService.createInstance(WorkspaceTrustRequestService));
				let prompts = 0;
				store.add(requests.onDidInitiateWorkspaceTrustRequest(() => prompts++));

				const request = requests.requestWorkspaceTrust();
				await requests.completeWorkspaceTrustRequest(true);
				const result = await request;
				const secondRequest = requests.requestWorkspaceTrust();
				requests.cancelWorkspaceTrustRequest();

				assert.deepStrictEqual({
					result,
					secondResult: await secondRequest,
					prompts,
					trusted: testObject.isWorkspaceTrusted(),
					errors: notifications.map(String),
				}, {
					result: undefined,
					secondResult: undefined,
					prompts: 2,
					trusted: false,
					errors: ['Error: The source of this workspace could not be determined. Continue in Restricted Mode until its source can be verified.'],
				});
			});

			test('an unresolved resource trust request completes and can be requested again', async () => {
				const testObject = await initializeTestObject();
				instantiationService.stub(IWorkspaceTrustManagementService, testObject);
				const requests = store.add(instantiationService.createInstance(WorkspaceTrustRequestService));
				let prompts = 0;
				store.add(requests.onDidInitiateResourcesTrustRequest(() => prompts++));

				const firstPrompt = Event.toPromise(requests.onDidInitiateResourcesTrustRequest);
				const request = requests.requestResourcesTrust({ uri: pullRequest });
				await firstPrompt;
				await requests.completeResourcesTrustRequest(pullRequest, WorkspaceTrustUriResponse.Open);
				const result = await request;

				const nextPrompt = Event.toPromise(requests.onDidInitiateResourcesTrustRequest);
				const secondRequest = requests.requestResourcesTrust({ uri: pullRequest });
				await nextPrompt;
				await requests.completeResourcesTrustRequest(pullRequest, WorkspaceTrustUriResponse.Cancel);

				assert.deepStrictEqual({
					result,
					secondResult: await secondRequest,
					prompts,
					trusted: testObject.isWorkspaceTrusted(),
					errors: notifications.map(String),
				}, {
					result: undefined,
					secondResult: false,
					prompts: 2,
					trusted: false,
					errors: ['Error: The source of this workspace could not be determined. Continue in Restricted Mode until its source can be verified.'],
				});
			});

			test('remains restricted while the source is being resolved', async () => {
				const source = new DeferredPromise<URI | undefined>();
				store.add(canonicalUriService.registerCanonicalUriProvider({
					scheme: 'vscode-vfs',
					provideCanonicalUri: () => source.p,
				}));
				const testObject = store.add(instantiationService.createInstance(WorkspaceTrustManagementService));
				const trustChanges: boolean[] = [];
				store.add(testObject.onDidChangeTrust(trusted => trustChanges.push(trusted)));

				assert.strictEqual(testObject.isWorkspaceTrusted(), false);
				await source.complete(fork);
				await testObject.workspaceTrustInitialized;

				assert.deepStrictEqual({
					trusted: testObject.isWorkspaceTrusted(),
					trustChanges,
					source: (await testObject.getUriTrustInfo(pullRequest)).uri.toString(),
				}, {
					trusted: false,
					trustChanges: [],
					source: fork.toString(),
				});
			});

			test('resolves a late provider without inheriting base trust', async () => {
				const testObject = await initializeTestObject();
				const updated = Event.toPromise(testObject.onDidChangeTrustedFolders);
				registerSource(fork);
				await updated;

				assert.deepStrictEqual({
					trusted: testObject.isWorkspaceTrusted(),
					canTrust: testObject.canSetWorkspaceTrust(),
					source: (await testObject.getUriTrustInfo(pullRequest)).uri.toString(),
				}, {
					trusted: false,
					canTrust: true,
					source: fork.toString(),
				});
			});

			test('preserves trust for a verified same-repository pull request', async () => {
				registerSource(base);
				const testObject = await initializeTestObject();

				assert.deepStrictEqual({
					trusted: testObject.isWorkspaceTrusted(),
					source: (await testObject.getUriTrustInfo(pullRequest)).uri.toString(),
				}, {
					trusted: true,
					source: base.toString(),
				});
			});

			test('an already-approved fork is enabled only after a late source lookup', async () => {
				const testObject = await initializeTestObject();
				await testObject.setUrisTrust([fork], true);
				const beforeResolution = testObject.isWorkspaceTrusted();
				const trustChanges: boolean[] = [];
				store.add(testObject.onDidChangeTrust(trusted => trustChanges.push(trusted)));
				const updated = Event.toPromise(testObject.onDidChangeTrustedFolders);
				registerSource(fork);
				await updated;

				assert.deepStrictEqual({
					beforeResolution,
					trusted: testObject.isWorkspaceTrusted(),
					trustChanges,
				}, {
					beforeResolution: false,
					trusted: true,
					trustChanges: [true],
				});
			});

			test('retry without a provider remains restricted and refreshes the trust UI', async () => {
				const testObject = await initializeTestObject();
				let updates = 0;
				store.add(testObject.onDidChangeTrustedFolders(() => updates++));
				await testObject.resolveWorkspaceTrust();

				assert.deepStrictEqual({
					trusted: testObject.isWorkspaceTrusted(),
					resolved: testObject.isWorkspaceTrustSourceResolved(),
					canTrust: testObject.canSetWorkspaceTrust(),
					updates,
					trustedUris: testObject.getTrustedUris().map(uri => uri.toString()),
				}, {
					trusted: false,
					resolved: false,
					canTrust: false,
					updates: 1,
					trustedUris: [base.toString()],
				});
			});

			test('retry recovers from a temporary lookup error without a reload', async () => {
				let failed = true;
				store.add(canonicalUriService.registerCanonicalUriProvider({
					scheme: 'vscode-vfs',
					provideCanonicalUri: async () => {
						if (failed) {
							throw new Error('Sign in required');
						}
						return base;
					},
				}));
				const testObject = await initializeTestObject();
				const trustChanges: boolean[] = [];
				store.add(testObject.onDidChangeTrust(trusted => trustChanges.push(trusted)));
				await testObject.resolveWorkspaceTrust();
				assert.strictEqual(testObject.isWorkspaceTrustSourceResolved(), false);
				assert.strictEqual(testObject.isWorkspaceTrusted(), false);

				failed = false;
				await testObject.resolveWorkspaceTrust();

				assert.deepStrictEqual({
					trusted: testObject.isWorkspaceTrusted(),
					resolved: testObject.isWorkspaceTrustSourceResolved(),
					trustChanges,
				}, {
					trusted: true,
					resolved: true,
					trustChanges: [true],
				});
			});

			test('retry makes an untrusted source approvable without approving it', async () => {
				let available = false;
				store.add(canonicalUriService.registerCanonicalUriProvider({
					scheme: 'vscode-vfs',
					provideCanonicalUri: async () => available ? fork : undefined,
				}));
				const testObject = await initializeTestObject();
				available = true;
				await testObject.resolveWorkspaceTrust();

				assert.deepStrictEqual({
					trusted: testObject.isWorkspaceTrusted(),
					resolved: testObject.isWorkspaceTrustSourceResolved(),
					canTrust: testObject.canSetWorkspaceTrust(),
					trustedUris: testObject.getTrustedUris().map(uri => uri.toString()),
				}, {
					trusted: false,
					resolved: true,
					canTrust: true,
					trustedUris: [base.toString()],
				});
				await testObject.setWorkspaceTrust(true);
				assert.strictEqual(testObject.isWorkspaceTrusted(), true);
				assert.deepStrictEqual(testObject.getTrustedUris().map(uri => uri.toString()), [base.toString(), fork.toString()]);
			});

			test('a successful resource lookup also updates the canonical workspace and its trust', async () => {
				let available = false;
				store.add(canonicalUriService.registerCanonicalUriProvider({
					scheme: 'vscode-vfs',
					provideCanonicalUri: async () => available ? fork : undefined,
				}));
				const testObject = await initializeTestObject();
				await testObject.setUrisTrust([fork], true);
				assert.strictEqual(testObject.isWorkspaceTrusted(), false);

				available = true;
				const info = await testObject.getUriTrustInfo(pullRequest);
				assert.strictEqual(info.trusted, true);
				assert.strictEqual(testObject.isWorkspaceTrusted(), true);
				await testObject.setWorkspaceTrust(false);
				assert.strictEqual(testObject.isWorkspaceTrusted(), false);
				assert.deepStrictEqual(testObject.getTrustedUris().map(uri => uri.toString()), [base.toString()]);
			});

			test('replacing a provider invalidates its cached source and old disposal keeps the replacement', async () => {
				const original = registerSource(base);
				const testObject = await initializeTestObject();
				assert.strictEqual(testObject.isWorkspaceTrusted(), true);

				const updated = Event.toPromise(testObject.onDidChangeTrustedFolders);
				registerSource(fork);
				await updated;
				original.dispose();

				assert.strictEqual(testObject.isWorkspaceTrusted(), false);
				assert.strictEqual(testObject.isWorkspaceTrustSourceResolved(), true);
				assert.strictEqual((await testObject.getUriTrustInfo(pullRequest)).uri.toString(), fork.toString());
			});

			test('public trust lookup rechecks a provider replaced after a cached resolution', async () => {
				registerSource(base);
				const testObject = await initializeTestObject();

				queueMicrotask(() => registerSource(fork));
				const result = await testObject.getUriTrustInfo(pullRequest);
				await testObject.resolveWorkspaceTrust();

				assert.deepStrictEqual({ trusted: result.trusted, uri: result.uri.toString() }, {
					trusted: false,
					uri: fork.toString(),
				});
			});

			test('public trust lookup rechecks a provider replaced during workspace recovery', async () => {
				let sourceAvailable = false;
				store.add(canonicalUriService.registerCanonicalUriProvider({
					scheme: 'vscode-vfs',
					provideCanonicalUri: async () => sourceAvailable ? base : undefined,
				}));
				const recovering = new DeferredPromise<void>();
				const resume = new DeferredPromise<void>();
				let pauseRecovery = true;
				const testObject = store.add(instantiationService.createInstance(class extends WorkspaceTrustManagementService {
					override async resolveWorkspaceTrust(): Promise<void> {
						await super.resolveWorkspaceTrust();
						if (pauseRecovery) {
							pauseRecovery = false;
							recovering.complete();
							await resume.p;
						}
					}
				}));
				await testObject.workspaceTrustInitialized;
				sourceAvailable = true;

				const lookup = testObject.getUriTrustInfo(pullRequest);
				await recovering.p;
				registerSource(fork);
				resume.complete();
				const result = await lookup;
				await testObject.resolveWorkspaceTrust();

				assert.deepStrictEqual({ trusted: result.trusted, uri: result.uri.toString() }, {
					trusted: false,
					uri: fork.toString(),
				});
			});

			test('public trust lookup bounds retries when the provider keeps changing', async () => {
				workspaceService.setWorkspace(new Workspace('base-repository', [toWorkspaceFolder(base)]));
				let lookups = 0;
				const warnings: string[] = [];
				instantiationService.stub(ILogService, new class extends NullLogService {
					override warn(message: string) {
						warnings.push(message);
					}
				});
				const registerChangingSource = () => {
					store.add(canonicalUriService.registerCanonicalUriProvider({
						scheme: 'vscode-vfs',
						provideCanonicalUri: async () => {
							lookups++;
							queueMicrotask(registerChangingSource);
							return base;
						},
					}));
				};
				registerChangingSource();
				const testObject = await initializeTestObject();

				const result = await testObject.getUriTrustInfo(pullRequest.with({ query: 'view=1', fragment: 'L1' }));
				await testObject.resolveWorkspaceTrust();

				assert.deepStrictEqual({
					trusted: result.trusted,
					uri: result.uri.toString(),
					lookups,
					warned: warnings.includes('Unable to verify resource trust because its provider changed'),
				}, {
					trusted: false,
					uri: pullRequest.toString(),
					lookups: 2,
					warned: true,
				});
			});

			for (const trusted of [true, false]) {
				test(`public trust mutation rejects a provider change before ${trusted ? 'granting' : 'revoking'} trust`, async () => {
					registerSource(fork);
					const testObject = await initializeTestObject();
					const local = URI.file('/trusted/local');
					if (!trusted) {
						await testObject.setUrisTrust([local, fork], true);
					}
					const previousUris = testObject.getTrustedUris().map(uri => uri.toString());
					const previousStorage = storageService.get(WORKSPACE_TRUST_STORAGE_KEY, StorageScope.APPLICATION_SHARED);

					queueMicrotask(() => registerSource(fork.with({ path: '/another-fork/project' })));
					await assert.rejects(testObject.setUrisTrust([local, pullRequest], trusted), /source must be verified again/);
					await testObject.resolveWorkspaceTrust();

					assert.deepStrictEqual({
						uris: testObject.getTrustedUris().map(uri => uri.toString()),
						storage: storageService.get(WORKSPACE_TRUST_STORAGE_KEY, StorageScope.APPLICATION_SHARED),
					}, { uris: previousUris, storage: previousStorage });
				});
			}

			test('public trust-list replacement rejects a provider change without modifying approvals', async () => {
				registerSource(fork);
				const testObject = await initializeTestObject();
				const previousStorage = storageService.get(WORKSPACE_TRUST_STORAGE_KEY, StorageScope.APPLICATION_SHARED);

				queueMicrotask(() => registerSource(fork.with({ path: '/another-fork/project' })));
				await assert.rejects(testObject.setTrustedUris([base, URI.file('/trusted/local'), pullRequest]), /source must be verified again/);
				await testObject.resolveWorkspaceTrust();

				assert.deepStrictEqual({
					uris: testObject.getTrustedUris().map(uri => uri.toString()),
					storage: storageService.get(WORKSPACE_TRUST_STORAGE_KEY, StorageScope.APPLICATION_SHARED),
				}, { uris: [base.toString()], storage: previousStorage });
			});

			test('public trust mutations resolve a stable pull-request source for approval and revocation', async () => {
				registerSource(fork);
				const testObject = await initializeTestObject();

				await testObject.setUrisTrust([pullRequest], true);
				const afterGrant = testObject.getTrustedUris().map(uri => uri.toString());
				await testObject.setUrisTrust([pullRequest], false);

				assert.deepStrictEqual({
					afterGrant,
					afterRevocation: testObject.getTrustedUris().map(uri => uri.toString()),
				}, {
					afterGrant: [base.toString(), fork.toString()],
					afterRevocation: [base.toString()],
				});
			});

			for (const providerChanges of [false, true]) {
				for (const trusted of [true, false]) {
					test(`public trust mutations reuse a stored source when ${trusted ? 'approving' : 'revoking'} with a ${providerChanges ? 'changing' : 'stable'} provider`, async () => {
						const enterpriseSource = fork.with({
							authority: `github-enterprise+${encodeHex(VSBuffer.fromString(JSON.stringify({ v: 1, instanceUri: 'https://host-a.ghe.com' })))}`,
						});
						workspaceService.setWorkspace(new Workspace('base-repository', [toWorkspaceFolder(base)]));
						storageService.store(WORKSPACE_TRUST_STORAGE_KEY, JSON.stringify({
							uriTrustInfo: [base, enterpriseSource].map(uri => ({ uri, trusted: true })),
						}), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
						let lookups = 0;
						const registerProvider = () => {
							store.add(canonicalUriService.registerCanonicalUriProvider({
								scheme: 'vscode-vfs',
								provideCanonicalUri: async () => {
									lookups++;
									return enterpriseSource;
								},
							}));
						};
						registerProvider();
						const testObject = await initializeTestObject();

						if (providerChanges) {
							await testObject.getUriTrustInfo(enterpriseSource);
							lookups = 0;
							queueMicrotask(registerProvider);
						}
						await testObject.setUrisTrust([enterpriseSource.with({ query: 'view=1', fragment: 'L1' })], trusted);
						await testObject.resolveWorkspaceTrust();

						assert.deepStrictEqual({
							uris: testObject.getTrustedUris().map(uri => uri.toString()),
							lookups,
						}, {
							uris: (trusted ? [base, enterpriseSource] : [base]).map(uri => uri.toString()),
							lookups: 0,
						});
					});
				}
			}

			for (const keepOtherEntry of [false, true]) {
				test(`public trust revocation preserves exact trailing-separator identities ${keepOtherEntry ? 'with' : 'without'} a similar stored entry`, async () => {
					const enterpriseSource = fork.with({
						authority: `github-enterprise+${encodeHex(VSBuffer.fromString(JSON.stringify({ v: 1, instanceUri: 'https://host-a.ghe.com' })))}`,
					});
					const sourceWithSeparator = enterpriseSource.with({ path: enterpriseSource.path + '/' });
					const remaining = keepOtherEntry ? [base, enterpriseSource] : [base];
					workspaceService.setWorkspace(new Workspace('base-repository', [toWorkspaceFolder(base)]));
					storageService.store(WORKSPACE_TRUST_STORAGE_KEY, JSON.stringify({
						uriTrustInfo: [...remaining, sourceWithSeparator].map(uri => ({ uri, trusted: true })),
					}), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
					let lookups = 0;
					const registerProvider = () => {
						store.add(canonicalUriService.registerCanonicalUriProvider({
							scheme: 'vscode-vfs',
							provideCanonicalUri: async uri => {
								lookups++;
								return URI.revive(uri);
							},
						}));
					};
					registerProvider();
					const testObject = await initializeTestObject();
					await testObject.getUriTrustInfo(sourceWithSeparator);
					lookups = 0;

					queueMicrotask(registerProvider);
					await testObject.setUrisTrust([sourceWithSeparator.with({ query: 'view=1', fragment: 'L1' })], false);
					await testObject.resolveWorkspaceTrust();

					assert.deepStrictEqual({
						uris: testObject.getTrustedUris().map(uri => uri.toString()),
						lookups,
					}, {
						uris: remaining.map(uri => uri.toString()),
						lookups: 0,
					});
				});
			}

			test('keeps verified trust during a provider gap and rechecks its replacement', async () => {
				const provider = registerSource(base);
				const testObject = await initializeTestObject();
				assert.strictEqual(testObject.isWorkspaceTrusted(), true);
				const trustChanges: boolean[] = [];
				store.add(testObject.onDidChangeTrust(trusted => trustChanges.push(trusted)));

				provider.dispose();
				await testObject.resolveWorkspaceTrust();
				assert.strictEqual(testObject.isWorkspaceTrusted(), true);
				assert.deepStrictEqual(trustChanges, []);

				const updated = Event.toPromise(testObject.onDidChangeTrustedFolders);
				registerSource(fork);
				await updated;

				assert.strictEqual(testObject.isWorkspaceTrusted(), false);
				assert.strictEqual(testObject.isWorkspaceTrustSourceResolved(), true);
				assert.deepStrictEqual(trustChanges, [false]);
			});

			test('a pending response from a replaced provider cannot grant base trust', async () => {
				const started = new DeferredPromise<void>();
				const source = new DeferredPromise<URI | undefined>();
				store.add(canonicalUriService.registerCanonicalUriProvider({
					scheme: 'vscode-vfs',
					provideCanonicalUri: () => {
						started.complete();
						return source.p;
					},
				}));
				const testObject = store.add(instantiationService.createInstance(WorkspaceTrustManagementService));
				const trustChanges: boolean[] = [];
				store.add(testObject.onDidChangeTrust(trusted => trustChanges.push(trusted)));
				await started.p;
				const updated = Event.toPromise(testObject.onDidChangeTrustedFolders);
				registerSource(fork);
				await source.complete(base);
				await testObject.workspaceTrustInitialized;
				await updated;

				assert.strictEqual(testObject.isWorkspaceTrusted(), false);
				assert.strictEqual((await testObject.getUriTrustInfo(pullRequest)).uri.toString(), fork.toString());
				assert.deepStrictEqual(trustChanges, []);
			});

			for (const depth of [2, 5]) {
				test(`does not publish stale trust across ${depth} asynchronous handoffs`, async () => {
					store.add(canonicalUriService.registerCanonicalUriProvider({
						scheme: 'vscode-vfs',
						provideCanonicalUri: async () => {
							// Exercise both the individual-lookup and final-snapshot promise boundaries.
							let replace: () => void = () => { registerSource(fork); };
							for (let i = 0; i < depth; i++) {
								const continuation = replace;
								replace = () => queueMicrotask(continuation);
							}
							replace();
							return base;
						},
					}));
					const testObject = store.add(instantiationService.createInstance(WorkspaceTrustManagementService));
					const trustChanges: boolean[] = [];
					store.add(testObject.onDidChangeTrust(trusted => trustChanges.push(trusted)));
					const updated = Event.toPromise(testObject.onDidChangeTrustedFolders);
					await testObject.workspaceTrustInitialized;
					await updated;

					assert.strictEqual(testObject.isWorkspaceTrusted(), false);
					assert.strictEqual((await testObject.getUriTrustInfo(pullRequest)).uri.toString(), fork.toString());
					assert.deepStrictEqual(trustChanges, []);
				});
			}

			test('does not combine workspace sources resolved by different provider registrations', async () => {
				const secondBase = base.with({ path: '/microsoft/second-project' });
				const secondPullRequest = pullRequest.with({ path: secondBase.path });
				workspaceService.setWorkspace(new Workspace('two-pull-requests', [
					toWorkspaceFolder(pullRequest), toWorkspaceFolder(secondPullRequest),
				]));
				storageService.store(WORKSPACE_TRUST_STORAGE_KEY, JSON.stringify({
					uriTrustInfo: [base, secondBase].map(uri => ({ uri, trusted: true })),
				}), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
				const secondStarted = new DeferredPromise<void>();
				const secondSource = new DeferredPromise<URI | undefined>();
				store.add(canonicalUriService.registerCanonicalUriProvider({
					scheme: 'vscode-vfs',
					provideCanonicalUri: async uri => {
						if (URI.revive(uri).path === base.path) {
							return base;
						}
						secondStarted.complete();
						return secondSource.p;
					},
				}));
				const testObject = store.add(instantiationService.createInstance(WorkspaceTrustManagementService));
				const trustChanges: boolean[] = [];
				store.add(testObject.onDidChangeTrust(trusted => trustChanges.push(trusted)));
				await secondStarted.p;
				await testObject.getUriTrustInfo(pullRequest);

				const updated = Event.toPromise(testObject.onDidChangeTrustedFolders);
				store.add(canonicalUriService.registerCanonicalUriProvider({
					scheme: 'vscode-vfs',
					provideCanonicalUri: async uri => URI.revive(uri).path === base.path ? fork : secondBase,
				}));
				await secondSource.complete(secondBase);
				await testObject.workspaceTrustInitialized;
				await updated;

				assert.strictEqual(testObject.isWorkspaceTrusted(), false);
				assert.deepStrictEqual(trustChanges, []);
			});

			test('rechecks a provider change between source verification and trust assignment', async () => {
				let lookedUp = false;
				let replaced = false;
				const workspace = new Workspace('final-source-handoff', [toWorkspaceFolder(pullRequest)]);
				Object.defineProperty(workspace, 'configuration', {
					get: () => {
						if (lookedUp && !replaced) {
							replaced = true;
							// The folder lookups are done; replace the provider before the caller resumes.
							queueMicrotask(() => registerSource(fork));
						}
						return undefined;
					},
				});
				workspaceService.setWorkspace(workspace);
				store.add(canonicalUriService.registerCanonicalUriProvider({
					scheme: 'vscode-vfs',
					provideCanonicalUri: async () => {
						lookedUp = true;
						return base;
					},
				}));
				const testObject = store.add(instantiationService.createInstance(WorkspaceTrustManagementService));
				const trustChanges: boolean[] = [];
				store.add(testObject.onDidChangeTrust(trusted => trustChanges.push(trusted)));
				const updated = Event.toPromise(testObject.onDidChangeTrustedFolders);
				await testObject.workspaceTrustInitialized;
				await updated;

				assert.strictEqual(replaced, true);
				assert.strictEqual(testObject.isWorkspaceTrusted(), false);
				assert.deepStrictEqual(trustChanges, []);
			});

			test('approval is stored for the fork and can be revoked independently', async () => {
				registerSource(fork);
				const testObject = await initializeTestObject();
				await testObject.setWorkspaceTrust(true);
				const approved = {
					trusted: testObject.isWorkspaceTrusted(),
					trustedUris: testObject.getTrustedUris().map(uri => uri.toString()),
					fileTrusted: (await testObject.getUriTrustInfo(URI.joinPath(pullRequest, 'src/index.ts'))).trusted,
					otherForkTrusted: (await testObject.getUriTrustInfo(fork.with({ path: '/another-fork/project' }))).trusted,
				};
				const restored = await initializeTestObject();
				const trustedAfterReload = restored.isWorkspaceTrusted();
				await restored.setWorkspaceTrust(false);

				assert.deepStrictEqual({
					approved,
					trustedAfterReload,
					trustedAfterRevocation: restored.isWorkspaceTrusted(),
					baseStillTrusted: (await restored.getUriTrustInfo(base)).trusted,
				}, {
					approved: {
						trusted: true,
						trustedUris: [base.toString(), fork.toString()],
						fileTrusted: true,
						otherForkTrusted: false,
					},
					trustedAfterReload: true,
					trustedAfterRevocation: false,
					baseStillTrusted: true,
				});
			});

			test('declining source trust leaves the PR restricted and the base trusted', async () => {
				registerSource(fork);
				const testObject = await initializeTestObject();
				instantiationService.stub(IWorkspaceTrustManagementService, testObject);
				const requests = store.add(instantiationService.createInstance(WorkspaceTrustRequestService));
				const prompts: URI[] = [];
				const completions: Promise<void>[] = [];
				store.add(requests.onDidInitiateResourcesTrustRequest(options => {
					prompts.push(options.uri);
					completions.push(requests.completeResourcesTrustRequest(options.uri, WorkspaceTrustUriResponse.Cancel));
				}));
				const result = await requests.requestResourcesTrust({ uri: fork });
				await Promise.all(completions);

				assert.deepStrictEqual({
					result,
					prompts: prompts.map(uri => uri.toString()),
					trusted: testObject.isWorkspaceTrusted(),
					trustedUris: testObject.getTrustedUris().map(uri => uri.toString()),
				}, {
					result: false,
					prompts: [fork.toString()],
					trusted: false,
					trustedUris: [base.toString()],
				});
			});

			test('accepting the source prompt enables the PR without storing base-PR trust', async () => {
				registerSource(fork);
				const testObject = await initializeTestObject();
				instantiationService.stub(IWorkspaceTrustManagementService, testObject);
				const requests = store.add(instantiationService.createInstance(WorkspaceTrustRequestService));
				const completions: Promise<void>[] = [];
				store.add(requests.onDidInitiateResourcesTrustRequest(options => {
					completions.push(requests.completeResourcesTrustRequest(options.uri, WorkspaceTrustUriResponse.Open));
				}));
				const result = await requests.requestResourcesTrust({ uri: fork });
				await Promise.all(completions);

				assert.deepStrictEqual({
					result,
					trusted: testObject.isWorkspaceTrusted(),
					trustedUris: testObject.getTrustedUris().map(uri => uri.toString()),
				}, {
					result: true,
					trusted: true,
					trustedUris: [base.toString(), fork.toString()],
				});
			});

			test('files remain readable while the PR is restricted', async () => {
				const fileService = instantiationService.get(IFileService);
				store.add(fileService.registerProvider('vscode-vfs', store.add(new InMemoryFileSystemProvider())));
				await fileService.createFolder(pullRequest);
				const file = URI.joinPath(pullRequest, 'review.ts');
				await fileService.writeFile(file, VSBuffer.fromString('export const value = 42;'));
				registerSource(fork);
				const testObject = await initializeTestObject();
				const contents = await fileService.readFile(file);

				assert.deepStrictEqual({
					trusted: testObject.isWorkspaceTrusted(),
					contents: contents.value.toString(),
				}, {
					trusted: false,
					contents: 'export const value = 42;',
				});
			});

			test('failed source resolution is logged and cannot grant trust', async () => {
				const errors: unknown[][] = [];
				instantiationService.stub(ILogService, Object.assign(new NullLogService(), {
					error: (...args: unknown[]) => { errors.push(args); },
				}));
				store.add(canonicalUriService.registerCanonicalUriProvider({
					scheme: 'vscode-vfs',
					provideCanonicalUri: async () => { throw new Error('Unable to fetch pull request'); },
				}));
				const testObject = await initializeTestObject();
				await assert.rejects(testObject.setTrustedUris([base, pullRequest]), /source of this workspace could not be determined/);

				assert.deepStrictEqual({
					trusted: testObject.isWorkspaceTrusted(),
					canTrust: testObject.canSetWorkspaceTrust(),
					loggedFailure: errors.length > 0,
					trustedUris: testObject.getTrustedUris().map(uri => uri.toString()),
				}, {
					trusted: false,
					canTrust: false,
					loggedFailure: true,
					trustedUris: [base.toString()],
				});
			});

			test('a source lookup times out after 30 seconds and can be retried', () => runWithFakedTimers({}, async () => {
				let available = false;
				const tokens: CancellationToken[] = [];
				store.add(canonicalUriService.registerCanonicalUriProvider({
					scheme: 'vscode-vfs',
					provideCanonicalUri: (_uri, _scheme, token) => {
						tokens.push(token);
						return available ? Promise.resolve(fork) : new Promise<URI | undefined>(() => { });
					},
				}));
				const start = Date.now();
				const testObject = await initializeTestObject();
				assert.strictEqual(Date.now() - start, 30_000);
				assert.strictEqual(tokens[0].isCancellationRequested, true);
				assert.strictEqual(testObject.isWorkspaceTrusted(), false);
				assert.strictEqual(testObject.isWorkspaceTrustSourceResolved(), false);

				available = true;
				await testObject.resolveWorkspaceTrust();
				assert.strictEqual(testObject.isWorkspaceTrustSourceResolved(), true);
				assert.strictEqual(testObject.isWorkspaceTrusted(), false);
				assert.strictEqual(tokens.length, 2);
			}));

			test('does not accept an automatically trusted scheme as the source', async () => {
				registerSource(URI.parse('https://github.com/fork-owner/project'));
				const testObject = await initializeTestObject();

				assert.deepStrictEqual({
					trusted: testObject.isWorkspaceTrusted(),
					canTrust: testObject.canSetWorkspaceTrust(),
					resourceTrusted: (await testObject.getUriTrustInfo(pullRequest)).trusted,
				}, {
					trusted: false,
					canTrust: false,
					resourceTrusted: false,
				});
			});

			test('enterprise approvals without a server or for another server do not trust a source', async () => {
				const sourceFor = (instanceUri: string) => fork.with({
					authority: `github-enterprise+${encodeHex(VSBuffer.fromString(JSON.stringify({ v: 1, instanceUri })))}`,
				});
				const source = sourceFor('https://host-a.ghe.com');
				const otherSource = sourceFor('https://host-b.ghe.com');
				const legacySource = source.with({ authority: 'github-enterprise' });
				storageService.store(WORKSPACE_TRUST_STORAGE_KEY, JSON.stringify({
					uriTrustInfo: [legacySource, otherSource].map(uri => ({ uri, trusted: true })),
				}), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
				store.add(canonicalUriService.registerCanonicalUriProvider({
					scheme: 'vscode-vfs',
					provideCanonicalUri: async uri => URI.revive(uri).toString() === pullRequest.toString() ? source : URI.revive(uri),
				}));
				const testObject = await initializeTestObject();
				assert.strictEqual(testObject.isWorkspaceTrusted(), false);
				await testObject.setWorkspaceTrust(true);

				assert.strictEqual(testObject.isWorkspaceTrusted(), true);
				assert.deepStrictEqual(testObject.getTrustedUris().map(uri => uri.toString()), [
					legacySource.toString(), otherSource.toString(), source.toString(),
				]);
			});

			test('a verified enterprise source can be approved without fetching the fork again', async () => {
				const host = { v: 1, instanceUri: 'https://host-a.ghe.com' };
				const enterpriseBase = base.with({ authority: `github-enterprise+${encodeHex(VSBuffer.fromString(JSON.stringify(host)))}` });
				const source = enterpriseBase.with({ path: fork.path });
				const enterprisePullRequest = enterpriseBase.with({
					authority: `github-enterprise+${encodeHex(VSBuffer.fromString(JSON.stringify({ ...host, ref: { type: 3, id: '1887' } })))}`,
				});
				workspaceService.setWorkspace(new Workspace('enterprise-pr', [toWorkspaceFolder(enterprisePullRequest)]));
				storageService.store(WORKSPACE_TRUST_STORAGE_KEY, JSON.stringify({
					uriTrustInfo: [{ uri: enterpriseBase, trusted: true }],
				}), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
				const lookups: string[] = [];
				store.add(canonicalUriService.registerCanonicalUriProvider({
					scheme: 'vscode-vfs',
					provideCanonicalUri: async uri => {
						lookups.push(URI.revive(uri).toString());
						if (URI.revive(uri).toString() !== enterprisePullRequest.toString()) {
							throw new Error('The fork cannot be fetched directly');
						}
						return source;
					},
				}));
				const testObject = await initializeTestObject();
				instantiationService.stub(IWorkspaceTrustManagementService, testObject);
				const requests = store.add(instantiationService.createInstance(WorkspaceTrustRequestService));
				store.add(requests.onDidInitiateResourcesTrustRequest(options => {
					void requests.completeResourcesTrustRequest(options.uri, WorkspaceTrustUriResponse.Open);
				}));
				assert.strictEqual(await requests.requestResourcesTrust({ uri: source }), true);
				assert.strictEqual(testObject.isWorkspaceTrusted(), true);
				assert.deepStrictEqual(testObject.getTrustedUris().map(uri => uri.toString()), [enterpriseBase.toString(), source.toString()]);

				const restored = await initializeTestObject();
				assert.strictEqual(restored.isWorkspaceTrusted(), true);
				assert.deepStrictEqual(lookups, [enterprisePullRequest.toString(), enterprisePullRequest.toString()]);
			});

			test('unrelated trust-list edits preserve existing enterprise approvals without a provider', async () => {
				const local = URI.file('/trusted/local');
				const editedLocal = URI.file('/trusted/renamed-local');
				const enterpriseSource = fork.with({
					authority: `github-enterprise+${encodeHex(VSBuffer.fromString(JSON.stringify({ v: 1, instanceUri: 'https://host-a.ghe.com' })))}`,
				});
				workspaceService.setWorkspace(new Workspace('local-window', [toWorkspaceFolder(local)]));
				storageService.store(WORKSPACE_TRUST_STORAGE_KEY, JSON.stringify({
					uriTrustInfo: [local, enterpriseSource].map(uri => ({ uri, trusted: true })),
				}), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
				const testObject = await initializeTestObject();
				assert.strictEqual((await testObject.getUriTrustInfo(enterpriseSource)).trusted, false);

				await testObject.setTrustedUris([editedLocal, enterpriseSource]);
				const expected = [editedLocal.toString(), enterpriseSource.toString()];
				assert.deepStrictEqual(testObject.getTrustedUris().map(uri => uri.toString()), expected);
				assert.strictEqual((await testObject.getUriTrustInfo(enterpriseSource)).trusted, false);

				await assert.rejects(testObject.setTrustedUris([
					editedLocal, enterpriseSource.with({ path: '/another-fork/project' }),
				]), /source of this workspace could not be determined/);
				assert.deepStrictEqual(testObject.getTrustedUris().map(uri => uri.toString()), expected);

				await testObject.setTrustedUris([editedLocal]);
				assert.deepStrictEqual(testObject.getTrustedUris().map(uri => uri.toString()), [editedLocal.toString()]);
			});

			test('public trust operations ignore provider changes unrelated to their source resolution', async () => {
				const local = URI.file('/trusted/local');
				const enterpriseSource = fork.with({
					authority: `github-enterprise+${encodeHex(VSBuffer.fromString(JSON.stringify({ v: 1, instanceUri: 'https://host-a.ghe.com' })))}`,
				});
				workspaceService.setWorkspace(new Workspace('base-repository', [toWorkspaceFolder(base)]));
				storageService.store(WORKSPACE_TRUST_STORAGE_KEY, JSON.stringify({
					uriTrustInfo: [base, enterpriseSource].map(uri => ({ uri, trusted: true })),
				}), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
				const testObject = await initializeTestObject();

				queueMicrotask(() => registerSource(fork));
				const baseTrusted = (await testObject.getUriTrustInfo(base)).trusted;
				queueMicrotask(() => registerSource(fork));
				await testObject.setUrisTrust([local], true);
				const afterGrant = testObject.getTrustedUris().map(uri => uri.toString());
				queueMicrotask(() => registerSource(fork));
				await testObject.setUrisTrust([local], false);
				const afterRevocation = testObject.getTrustedUris().map(uri => uri.toString());
				queueMicrotask(() => registerSource(fork));
				await testObject.setTrustedUris([base, enterpriseSource, local]);
				await testObject.resolveWorkspaceTrust();

				assert.deepStrictEqual({
					baseTrusted,
					afterGrant,
					afterRevocation,
					afterReplacement: testObject.getTrustedUris().map(uri => uri.toString()),
				}, {
					baseTrusted: true,
					afterGrant: [base, enterpriseSource, local].map(uri => uri.toString()),
					afterRevocation: [base, enterpriseSource].map(uri => uri.toString()),
					afterReplacement: [base, enterpriseSource, local].map(uri => uri.toString()),
				});
			});
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
