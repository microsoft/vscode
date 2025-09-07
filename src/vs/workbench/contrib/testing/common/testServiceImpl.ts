/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupBy } from '../../../../base/common/arrays.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Location } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { getTestingConfiguration, TestingConfigKeys } from './configuration.js';
import { MainThreadTestCollection } from './mainThreadTestCollection.js';
import { MutableObservableValue } from './observableValue.js';
import { StoredValue } from './storedValue.js';
import { TestExclusions } from './testExclusions.js';
import { TestId } from './testId.js';
import { TestingContextKeys } from './testingContextKeys.js';
import { canUseProfileWithTest, ITestProfileService } from './testProfileService.js';
import { ITestResult } from './testResult.js';
import { ITestResultService } from './testResultService.js';
import { AmbiguousRunTestsRequest, IMainThreadTestController, IMainThreadTestHostProxy, ITestFollowups, ITestService } from './testService.js';
import { InternalTestItem, ITestRunProfile, ResolvedTestRunRequest, TestControllerCapability, TestDiffOpType, TestMessageFollowupRequest, TestsDiff } from './testTypes.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

export class TestService extends Disposable implements ITestService {
	declare readonly _serviceBrand: undefined;
	private testControllers = observableValue<ReadonlyMap<string, IMainThreadTestController>>('testControllers', new Map<string, IMainThreadTestController>());
	private testExtHosts = new Set<IMainThreadTestHostProxy>();

	private readonly cancelExtensionTestRunEmitter = new Emitter<{ runId: string | undefined; taskId: string | undefined }>();
	private readonly willProcessDiffEmitter = new Emitter<TestsDiff>();
	private readonly didProcessDiffEmitter = new Emitter<TestsDiff>();
	private readonly testRefreshCancellations = new Set<CancellationTokenSource>();
	private readonly isRefreshingTests: IContextKey<boolean>;
	private readonly activeEditorHasTests: IContextKey<boolean>;

	/**
	 * Cancellation for runs requested by the user being managed by the UI.
	 * Test runs initiated by extensions are not included here.
	 */
	private readonly uiRunningTests = new Map<string /* run ID */, CancellationTokenSource>();

	/**
	 * @inheritdoc
	 */
	public readonly onWillProcessDiff = this.willProcessDiffEmitter.event;

	/**
	 * @inheritdoc
	 */
	public readonly onDidProcessDiff = this.didProcessDiffEmitter.event;

	/**
	 * @inheritdoc
	 */
	public readonly onDidCancelTestRun = this.cancelExtensionTestRunEmitter.event;

	/**
	 * @inheritdoc
	 */
	public readonly collection: MainThreadTestCollection;

	/**
	 * @inheritdoc
	 */
	public readonly excluded: TestExclusions;

	/**
	 * @inheritdoc
	 */
	public readonly showInlineOutput: MutableObservableValue<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IStorageService storage: IStorageService,
		@IEditorService private readonly editorService: IEditorService,
		@ITestProfileService private readonly testProfiles: ITestProfileService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITestResultService private readonly testResults: ITestResultService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
	) {
		super();
		this.collection = new MainThreadTestCollection(uriIdentityService, this.expandTest.bind(this));
		this.showInlineOutput = this._register(MutableObservableValue.stored(new StoredValue<boolean>({
			key: 'inlineTestOutputVisible',
			scope: StorageScope.WORKSPACE,
			target: StorageTarget.USER
		}, storage), true));

		this.excluded = instantiationService.createInstance(TestExclusions);
		this.isRefreshingTests = TestingContextKeys.isRefreshingTests.bindTo(contextKeyService);
		this.activeEditorHasTests = TestingContextKeys.activeEditorHasTests.bindTo(contextKeyService);

		this._register(bindContextKey(TestingContextKeys.providerCount, contextKeyService,
			reader => this.testControllers.read(reader).size));

		const bindCapability = (key: RawContextKey<boolean>, capability: TestControllerCapability) =>
			this._register(bindContextKey(key, contextKeyService, reader =>
				Iterable.some(
					this.testControllers.read(reader).values(),
					ctrl => !!(ctrl.capabilities.read(reader) & capability)
				),
			));

		bindCapability(TestingContextKeys.canRefreshTests, TestControllerCapability.Refresh);
		bindCapability(TestingContextKeys.canGoToRelatedCode, TestControllerCapability.CodeRelatedToTest);
		bindCapability(TestingContextKeys.canGoToRelatedTest, TestControllerCapability.TestRelatedToCode);

		this._register(editorService.onDidActiveEditorChange(() => this.updateEditorContextKeys()));
	}

	/**
	 * @inheritdoc
	 */
	public async expandTest(id: string, levels: number) {
		await this.testControllers.get().get(TestId.fromString(id).controllerId)?.expandTest(id, levels);
	}

	/**
	 * @inheritdoc
	 */
	public cancelTestRun(runId?: string, taskId?: string) {
		this.cancelExtensionTestRunEmitter.fire({ runId, taskId });

		if (runId === undefined) {
			for (const runCts of this.uiRunningTests.values()) {
				runCts.cancel();
			}
		} else if (!taskId) {
			this.uiRunningTests.get(runId)?.cancel();
		}
	}

	/**
	 * @inheritdoc
	 */
	public async runTests(req: AmbiguousRunTestsRequest, token = CancellationToken.None): Promise<ITestResult> {
		// We try to ensure that all tests in the request will be run, preferring
		// to use default profiles for each controller when possible.
		const byProfile: { profile: ITestRunProfile; tests: InternalTestItem[] }[] = [];
		for (const test of req.tests) {
			const existing = byProfile.find(p => canUseProfileWithTest(p.profile, test));
			if (existing) {
				existing.tests.push(test);
				continue;
			}

			const bestProfile = this.testProfiles.getDefaultProfileForTest(req.group, test);
			if (!bestProfile) {
				continue;
			}

			byProfile.push({ profile: bestProfile, tests: [test] });
		}

		const resolved: ResolvedTestRunRequest = {
			targets: byProfile.map(({ profile, tests }) => ({
				profileId: profile.profileId,
				controllerId: tests[0].controllerId,
				testIds: tests.map(t => t.item.extId),
			})),
			group: req.group,
			exclude: req.exclude?.map(t => t.item.extId),
			continuous: req.continuous,
			preserveFocus: req.preserveFocus,
		};

		// If no tests are covered by the defaults, just use whatever the defaults
		// for their controller are. This can happen if the user chose specific
		// profiles for the run button, but then asked to run a single test from the
		// explorer or decoration. We shouldn't no-op.
		if (resolved.targets.length === 0) {
			for (const byController of groupBy(req.tests, (a, b) => a.controllerId === b.controllerId ? 0 : 1)) {
				const profiles = this.testProfiles.getControllerProfiles(byController[0].controllerId);
				const withControllers = byController.map(test => ({
					profile: profiles.find(p => p.group === req.group && canUseProfileWithTest(p, test)),
					test,
				}));

				for (const byProfile of groupBy(withControllers, (a, b) => a.profile === b.profile ? 0 : 1)) {
					const profile = byProfile[0].profile;
					if (profile) {
						resolved.targets.push({
							testIds: byProfile.map(t => t.test.item.extId),
							profileId: profile.profileId,
							controllerId: profile.controllerId,
						});
					}
				}
			}
		}

		return this.runResolvedTests(resolved, token);
	}

	/** @inheritdoc */
	public async startContinuousRun(req: ResolvedTestRunRequest, token: CancellationToken) {
		if (!req.exclude) {
			req.exclude = [...this.excluded.all];
		}

		const trust = await this.workspaceTrustRequestService.requestWorkspaceTrust({
			message: localize('testTrust', "Running tests may execute code in your workspace."),
		});

		if (!trust) {
			return;
		}

		const byController = groupBy(req.targets, (a, b) => a.controllerId.localeCompare(b.controllerId));
		const requests = byController.map(
			group => this.getTestController(group[0].controllerId)?.startContinuousRun(
				group.map(controlReq => ({
					excludeExtIds: req.exclude!.filter(t => !controlReq.testIds.includes(t)),
					profileId: controlReq.profileId,
					controllerId: controlReq.controllerId,
					testIds: controlReq.testIds,
				})),
				token,
			).then(result => {
				const errs = result.map(r => r.error).filter(isDefined);
				if (errs.length) {
					this.notificationService.error(localize('testError', 'An error occurred attempting to run tests: {0}', errs.join(' ')));
				}
			})
		);

		await Promise.all(requests);
	}

	/**
	 * @inheritdoc
	 */
	public async runResolvedTests(req: ResolvedTestRunRequest, token = CancellationToken.None) {
		if (!req.exclude) {
			req.exclude = [...this.excluded.all];
		}

		const result = this.testResults.createLiveResult(req);
		const trust = await this.workspaceTrustRequestService.requestWorkspaceTrust({
			message: localize('testTrust', "Running tests may execute code in your workspace."),
		});

		if (!trust) {
			result.markComplete();
			return result;
		}

		try {
			const cancelSource = new CancellationTokenSource(token);
			this.uiRunningTests.set(result.id, cancelSource);

			const byController = groupBy(req.targets, (a, b) => a.controllerId.localeCompare(b.controllerId));
			const requests = byController.map(
				group => this.getTestController(group[0].controllerId)?.runTests(
					group.map(controlReq => ({
						runId: result.id,
						excludeExtIds: req.exclude!.filter(t => !controlReq.testIds.includes(t)),
						profileId: controlReq.profileId,
						controllerId: controlReq.controllerId,
						testIds: controlReq.testIds,
					})),
					cancelSource.token,
				).then(result => {
					const errs = result.map(r => r.error).filter(isDefined);
					if (errs.length) {
						this.notificationService.error(localize('testError', 'An error occurred attempting to run tests: {0}', errs.join(' ')));
					}
				})
			);
			await this.saveAllBeforeTest(req);
			await Promise.all(requests);
			return result;
		} finally {
			this.uiRunningTests.delete(result.id);
			result.markComplete();
		}
	}

	/**
	 * @inheritdoc
	 */
	public async provideTestFollowups(req: TestMessageFollowupRequest, token: CancellationToken): Promise<ITestFollowups> {
		const reqs = await Promise.all([...this.testExtHosts].map(async ctrl =>
			({ ctrl, followups: await ctrl.provideTestFollowups(req, token) })));

		const followups: ITestFollowups = {
			followups: reqs.flatMap(({ ctrl, followups }) => followups.map(f => ({
				message: f.title,
				execute: () => ctrl.executeTestFollowup(f.id)
			}))),
			dispose: () => {
				for (const { ctrl, followups } of reqs) {
					ctrl.disposeTestFollowups(followups.map(f => f.id));
				}
			}
		};

		if (token.isCancellationRequested) {
			followups.dispose();
		}

		return followups;
	}

	/**
	 * @inheritdoc
	 */
	public publishDiff(_controllerId: string, diff: TestsDiff) {
		this.willProcessDiffEmitter.fire(diff);
		this.collection.apply(diff);
		this.updateEditorContextKeys();
		this.didProcessDiffEmitter.fire(diff);
	}

	/**
	 * @inheritdoc
	 */
	public getTestController(id: string) {
		return this.testControllers.get().get(id);
	}

	/**
	 * @inheritdoc
	 */
	public async syncTests(): Promise<void> {
		const cts = new CancellationTokenSource();
		try {
			await Promise.all([...this.testControllers.get().values()].map(c => c.syncTests(cts.token)));
		} finally {
			cts.dispose(true);
		}
	}

	/**
	 * @inheritdoc
	 */
	public async refreshTests(controllerId?: string): Promise<void> {
		const cts = new CancellationTokenSource();
		this.testRefreshCancellations.add(cts);
		this.isRefreshingTests.set(true);

		try {
			if (controllerId) {
				await this.getTestController(controllerId)?.refreshTests(cts.token);
			} else {
				await Promise.all([...this.testControllers.get().values()].map(c => c.refreshTests(cts.token)));
			}
		} finally {
			this.testRefreshCancellations.delete(cts);
			this.isRefreshingTests.set(this.testRefreshCancellations.size > 0);
			cts.dispose(true);
		}
	}

	/**
	 * @inheritdoc
	 */
	public cancelRefreshTests(): void {
		for (const cts of this.testRefreshCancellations) {
			cts.cancel();
		}
		this.testRefreshCancellations.clear();
		this.isRefreshingTests.set(false);
	}

	/**
	 * @inheritdoc
	 */
	public registerExtHost(controller: IMainThreadTestHostProxy): IDisposable {
		this.testExtHosts.add(controller);
		return toDisposable(() => this.testExtHosts.delete(controller));
	}

	/**
	 * @inheritdoc
	 */
	public async getTestsRelatedToCode(uri: URI, position: Position, token: CancellationToken = CancellationToken.None): Promise<InternalTestItem[]> {
		const testIds = await Promise.all([...this.testExtHosts.values()].map(v => v.getTestsRelatedToCode(uri, position, token)));
		// ext host will flush diffs before returning, so we should have everything here:
		return testIds.flatMap(ids => ids.map(id => this.collection.getNodeById(id))).filter(isDefined);
	}

	/**
	 * @inheritdoc
	 */
	public registerTestController(id: string, controller: IMainThreadTestController): IDisposable {
		this.testControllers.set(new Map(this.testControllers.get()).set(id, controller), undefined);

		return toDisposable(() => {
			const diff: TestsDiff = [];
			for (const root of this.collection.rootItems) {
				if (root.controllerId === id) {
					diff.push({ op: TestDiffOpType.Remove, itemId: root.item.extId });
				}
			}

			this.publishDiff(id, diff);

			const next = new Map(this.testControllers.get());
			next.delete(id);
			this.testControllers.set(next, undefined);
		});
	}

	/**
	 * @inheritdoc
	 */
	public async getCodeRelatedToTest(test: InternalTestItem, token: CancellationToken = CancellationToken.None): Promise<Location[]> {
		return (await this.testControllers.get().get(test.controllerId)?.getRelatedCode(test.item.extId, token)) || [];
	}

	private updateEditorContextKeys() {
		const uri = this.editorService.activeEditor?.resource;
		if (uri) {
			this.activeEditorHasTests.set(!Iterable.isEmpty(this.collection.getNodeByUrl(uri)));
		} else {
			this.activeEditorHasTests.set(false);
		}
	}

	private async saveAllBeforeTest(req: ResolvedTestRunRequest, configurationService: IConfigurationService = this.configurationService, editorService: IEditorService = this.editorService): Promise<void> {
		if (req.preserveFocus === true) {
			return;
		}
		const saveBeforeTest = getTestingConfiguration(this.configurationService, TestingConfigKeys.SaveBeforeTest);
		if (saveBeforeTest) {
			await editorService.saveAll();
		}
		return;
	}
}


