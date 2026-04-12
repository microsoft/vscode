/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { groupBy } from '../../../../base/common/arrays.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { isDefined } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { getTestingConfiguration } from './configuration.js';
import { MainThreadTestCollection } from './mainThreadTestCollection.js';
import { MutableObservableValue } from './observableValue.js';
import { StoredValue } from './storedValue.js';
import { TestExclusions } from './testExclusions.js';
import { TestId } from './testId.js';
import { TestingContextKeys } from './testingContextKeys.js';
import { canUseProfileWithTest, ITestProfileService } from './testProfileService.js';
import { ITestResultService } from './testResultService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
let TestService = class TestService extends Disposable {
    constructor(contextKeyService, instantiationService, uriIdentityService, storage, editorService, testProfiles, notificationService, configurationService, testResults, workspaceTrustRequestService) {
        super();
        this.editorService = editorService;
        this.testProfiles = testProfiles;
        this.notificationService = notificationService;
        this.configurationService = configurationService;
        this.testResults = testResults;
        this.workspaceTrustRequestService = workspaceTrustRequestService;
        this.testControllers = observableValue('testControllers', new Map());
        this.testExtHosts = new Set();
        this.cancelExtensionTestRunEmitter = this._register(new Emitter());
        this.willProcessDiffEmitter = this._register(new Emitter());
        this.didProcessDiffEmitter = this._register(new Emitter());
        this.testRefreshCancellations = new Set();
        /**
         * Cancellation for runs requested by the user being managed by the UI.
         * Test runs initiated by extensions are not included here.
         */
        this.uiRunningTests = new Map();
        /**
         * @inheritdoc
         */
        this.onWillProcessDiff = this.willProcessDiffEmitter.event;
        /**
         * @inheritdoc
         */
        this.onDidProcessDiff = this.didProcessDiffEmitter.event;
        /**
         * @inheritdoc
         */
        this.onDidCancelTestRun = this.cancelExtensionTestRunEmitter.event;
        this.collection = new MainThreadTestCollection(uriIdentityService, this.expandTest.bind(this));
        this.showInlineOutput = this._register(MutableObservableValue.stored(new StoredValue({
            key: 'inlineTestOutputVisible',
            scope: 1 /* StorageScope.WORKSPACE */,
            target: 0 /* StorageTarget.USER */
        }, storage), true));
        this.excluded = instantiationService.createInstance(TestExclusions);
        this.isRefreshingTests = TestingContextKeys.isRefreshingTests.bindTo(contextKeyService);
        this.activeEditorHasTests = TestingContextKeys.activeEditorHasTests.bindTo(contextKeyService);
        this._register(bindContextKey(TestingContextKeys.providerCount, contextKeyService, reader => this.testControllers.read(reader).size));
        const bindCapability = (key, capability) => this._register(bindContextKey(key, contextKeyService, reader => Iterable.some(this.testControllers.read(reader).values(), ctrl => !!(ctrl.capabilities.read(reader) & capability))));
        bindCapability(TestingContextKeys.canRefreshTests, 2 /* TestControllerCapability.Refresh */);
        bindCapability(TestingContextKeys.canGoToRelatedCode, 4 /* TestControllerCapability.CodeRelatedToTest */);
        bindCapability(TestingContextKeys.canGoToRelatedTest, 8 /* TestControllerCapability.TestRelatedToCode */);
        this._register(editorService.onDidActiveEditorChange(() => this.updateEditorContextKeys()));
    }
    /**
     * @inheritdoc
     */
    async expandTest(id, levels) {
        await this.testControllers.get().get(TestId.fromString(id).controllerId)?.expandTest(id, levels);
    }
    /**
     * @inheritdoc
     */
    cancelTestRun(runId, taskId) {
        this.cancelExtensionTestRunEmitter.fire({ runId, taskId });
        if (runId === undefined) {
            for (const runCts of this.uiRunningTests.values()) {
                runCts.cancel();
            }
        }
        else if (!taskId) {
            this.uiRunningTests.get(runId)?.cancel();
        }
    }
    /**
     * @inheritdoc
     */
    async runTests(req, token = CancellationToken.None) {
        // We try to ensure that all tests in the request will be run, preferring
        // to use default profiles for each controller when possible.
        const byProfile = [];
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
        const resolved = {
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
    async startContinuousRun(req, token) {
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
        const requests = byController.map(group => this.getTestController(group[0].controllerId)?.startContinuousRun(group.map(controlReq => ({
            excludeExtIds: req.exclude.filter(t => !controlReq.testIds.includes(t)),
            profileId: controlReq.profileId,
            controllerId: controlReq.controllerId,
            testIds: controlReq.testIds,
        })), token).then(result => {
            const errs = result.map(r => r.error).filter(isDefined);
            if (errs.length) {
                this.notificationService.error(localize('testError', 'An error occurred attempting to run tests: {0}', errs.join(' ')));
            }
        }));
        await Promise.all(requests);
    }
    /**
     * @inheritdoc
     */
    async runResolvedTests(req, token = CancellationToken.None) {
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
            const requests = byController.map(group => this.getTestController(group[0].controllerId)?.runTests(group.map(controlReq => ({
                runId: result.id,
                excludeExtIds: req.exclude.filter(t => !controlReq.testIds.includes(t)),
                profileId: controlReq.profileId,
                controllerId: controlReq.controllerId,
                testIds: controlReq.testIds,
            })), cancelSource.token).then(result => {
                const errs = result.map(r => r.error).filter(isDefined);
                if (errs.length) {
                    this.notificationService.error(localize('testError', 'An error occurred attempting to run tests: {0}', errs.join(' ')));
                }
            }));
            await this.saveAllBeforeTest(req);
            await Promise.all(requests);
            return result;
        }
        finally {
            this.uiRunningTests.delete(result.id);
            result.markComplete();
        }
    }
    /**
     * @inheritdoc
     */
    async provideTestFollowups(req, token) {
        const reqs = await Promise.all([...this.testExtHosts].map(async (ctrl) => ({ ctrl, followups: await ctrl.provideTestFollowups(req, token) })));
        const followups = {
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
    publishDiff(_controllerId, diff) {
        this.willProcessDiffEmitter.fire(diff);
        this.collection.apply(diff);
        this.updateEditorContextKeys();
        this.didProcessDiffEmitter.fire(diff);
    }
    /**
     * @inheritdoc
     */
    getTestController(id) {
        return this.testControllers.get().get(id);
    }
    /**
     * @inheritdoc
     */
    async syncTests() {
        const cts = new CancellationTokenSource();
        try {
            await Promise.all([...this.testControllers.get().values()].map(c => c.syncTests(cts.token)));
        }
        finally {
            cts.dispose(true);
        }
    }
    /**
     * @inheritdoc
     */
    async refreshTests(controllerId) {
        const cts = new CancellationTokenSource();
        this.testRefreshCancellations.add(cts);
        this.isRefreshingTests.set(true);
        try {
            if (controllerId) {
                await this.getTestController(controllerId)?.refreshTests(cts.token);
            }
            else {
                await Promise.all([...this.testControllers.get().values()].map(c => c.refreshTests(cts.token)));
            }
        }
        finally {
            this.testRefreshCancellations.delete(cts);
            this.isRefreshingTests.set(this.testRefreshCancellations.size > 0);
            cts.dispose(true);
        }
    }
    /**
     * @inheritdoc
     */
    cancelRefreshTests() {
        for (const cts of this.testRefreshCancellations) {
            cts.cancel();
        }
        this.testRefreshCancellations.clear();
        this.isRefreshingTests.set(false);
    }
    /**
     * @inheritdoc
     */
    registerExtHost(controller) {
        this.testExtHosts.add(controller);
        return toDisposable(() => this.testExtHosts.delete(controller));
    }
    /**
     * @inheritdoc
     */
    async getTestsRelatedToCode(uri, position, token = CancellationToken.None) {
        const testIds = await Promise.all([...this.testExtHosts.values()].map(v => v.getTestsRelatedToCode(uri, position, token)));
        // ext host will flush diffs before returning, so we should have everything here:
        return testIds.flatMap(ids => ids.map(id => this.collection.getNodeById(id))).filter(isDefined);
    }
    /**
     * @inheritdoc
     */
    registerTestController(id, controller) {
        this.testControllers.set(new Map(this.testControllers.get()).set(id, controller), undefined);
        return toDisposable(() => {
            const diff = [];
            for (const root of this.collection.rootItems) {
                if (root.controllerId === id) {
                    diff.push({ op: 3 /* TestDiffOpType.Remove */, itemId: root.item.extId });
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
    async getCodeRelatedToTest(test, token = CancellationToken.None) {
        return (await this.testControllers.get().get(test.controllerId)?.getRelatedCode(test.item.extId, token)) || [];
    }
    updateEditorContextKeys() {
        const uri = this.editorService.activeEditor?.resource;
        if (uri) {
            this.activeEditorHasTests.set(!Iterable.isEmpty(this.collection.getNodeByUrl(uri)));
        }
        else {
            this.activeEditorHasTests.set(false);
        }
    }
    async saveAllBeforeTest(req, configurationService = this.configurationService, editorService = this.editorService) {
        if (req.preserveFocus === true) {
            return;
        }
        const saveBeforeTest = getTestingConfiguration(this.configurationService, "testing.saveBeforeTest" /* TestingConfigKeys.SaveBeforeTest */);
        if (saveBeforeTest) {
            await editorService.saveAll();
        }
        return;
    }
};
TestService = __decorate([
    __param(0, IContextKeyService),
    __param(1, IInstantiationService),
    __param(2, IUriIdentityService),
    __param(3, IStorageService),
    __param(4, IEditorService),
    __param(5, ITestProfileService),
    __param(6, INotificationService),
    __param(7, IConfigurationService),
    __param(8, ITestResultService),
    __param(9, IWorkspaceTrustRequestService)
], TestService);
export { TestService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFNlcnZpY2VJbXBsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdFNlcnZpY2VJbXBsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQWUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDN0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUk3RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFlLGtCQUFrQixFQUFpQixNQUFNLHNEQUFzRCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9B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