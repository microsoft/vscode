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
import { RunOnceScheduler } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { createSingleCallFunction } from '../../../base/common/functional.js';
import { hash } from '../../../base/common/hash.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { isDefined } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { TestId } from '../../contrib/testing/common/testId.js';
import { InvalidTestItemError } from '../../contrib/testing/common/testItemCollection.js';
import { AbstractIncrementalTestCollection, TestsDiffOp, isStartControllerTests } from '../../contrib/testing/common/testTypes.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { MainContext } from './extHost.protocol.js';
import { IExtHostCommands } from './extHostCommands.js';
import { IExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ExtHostTestItemCollection, TestItemImpl, TestItemRootImpl, toItemFromContext } from './extHostTestItem.js';
import * as Convert from './extHostTypeConverters.js';
import { FileCoverage, TestRunProfileBase, TestRunRequest } from './extHostTypes.js';
let followupCounter = 0;
const testResultInternalIDs = new WeakMap();
export const IExtHostTesting = createDecorator('IExtHostTesting');
let ExtHostTesting = class ExtHostTesting extends Disposable {
    constructor(rpc, logService, commands, editors) {
        super();
        this.logService = logService;
        this.commands = commands;
        this.editors = editors;
        this.resultsChangedEmitter = this._register(new Emitter());
        this.controllers = new Map();
        this.defaultProfilesChangedEmitter = this._register(new Emitter());
        this.followupProviders = new Set();
        this.testFollowups = new Map();
        this.onResultsChanged = this.resultsChangedEmitter.event;
        this.results = [];
        this.proxy = rpc.getProxy(MainContext.MainThreadTesting);
        this.observer = new TestObservers(this.proxy);
        this.runTracker = new TestRunCoordinator(this.proxy, logService);
        commands.registerArgumentProcessor({
            processArgument: arg => {
                switch (arg?.$mid) {
                    case 16 /* MarshalledId.TestItemContext */: {
                        const cast = arg;
                        const targetTest = cast.tests[cast.tests.length - 1].item.extId;
                        const controller = this.controllers.get(TestId.root(targetTest));
                        return controller?.collection.tree.get(targetTest)?.actual ?? toItemFromContext(arg);
                    }
                    case 18 /* MarshalledId.TestMessageMenuArgs */: {
                        const { test, message } = arg;
                        const extId = test.item.extId;
                        return {
                            test: this.controllers.get(TestId.root(extId))?.collection.tree.get(extId)?.actual
                                ?? toItemFromContext({ $mid: 16 /* MarshalledId.TestItemContext */, tests: [test] }),
                            message: Convert.TestMessage.to(message),
                        };
                    }
                    default: return arg;
                }
            }
        });
        commands.registerCommand(false, 'testing.getExplorerSelection', async () => {
            const inner = await commands.executeCommand("_testing.getExplorerSelection" /* TestCommandId.GetExplorerSelection */);
            const lookup = (i) => {
                const controller = this.controllers.get(TestId.root(i));
                if (!controller) {
                    return undefined;
                }
                return TestId.isRoot(i) ? controller.controller : controller.collection.tree.get(i)?.actual;
            };
            return {
                include: inner?.include.map(lookup).filter(isDefined) || [],
                exclude: inner?.exclude.map(lookup).filter(isDefined) || [],
            };
        });
    }
    //#region public API
    /**
     * Implements vscode.test.registerTestProvider
     */
    createTestController(extension, controllerId, label, refreshHandler) {
        if (this.controllers.has(controllerId)) {
            throw new Error(`Attempt to insert a duplicate controller with ID "${controllerId}"`);
        }
        const disposable = new DisposableStore();
        const collection = disposable.add(new ExtHostTestItemCollection(controllerId, label, this.editors));
        collection.root.label = label;
        const profiles = new Map();
        const activeProfiles = new Set();
        const proxy = this.proxy;
        const getCapability = () => {
            let cap = 0;
            if (refreshHandler) {
                cap |= 2 /* TestControllerCapability.Refresh */;
            }
            const rcp = info.relatedCodeProvider;
            if (rcp) {
                if (rcp?.provideRelatedTests) {
                    cap |= 8 /* TestControllerCapability.TestRelatedToCode */;
                }
                if (rcp?.provideRelatedCode) {
                    cap |= 4 /* TestControllerCapability.CodeRelatedToTest */;
                }
            }
            return cap;
        };
        const controller = {
            items: collection.root.children,
            get label() {
                return label;
            },
            set label(value) {
                label = value;
                collection.root.label = value;
                proxy.$updateController(controllerId, { label });
            },
            get refreshHandler() {
                return refreshHandler;
            },
            set refreshHandler(value) {
                refreshHandler = value;
                proxy.$updateController(controllerId, { capabilities: getCapability() });
            },
            get id() {
                return controllerId;
            },
            get relatedCodeProvider() {
                return info.relatedCodeProvider;
            },
            set relatedCodeProvider(value) {
                checkProposedApiEnabled(extension, 'testRelatedCode');
                info.relatedCodeProvider = value;
                proxy.$updateController(controllerId, { capabilities: getCapability() });
            },
            createRunProfile: (label, group, runHandler, isDefault, tag, supportsContinuousRun) => {
                // Derive the profile ID from a hash so that the same profile will tend
                // to have the same hashes, allowing re-run requests to work across reloads.
                let profileId = hash(label);
                while (profiles.has(profileId)) {
                    profileId++;
                }
                return new TestRunProfileImpl(this.proxy, profiles, activeProfiles, this.defaultProfilesChangedEmitter.event, controllerId, profileId, label, group, runHandler, isDefault, tag, supportsContinuousRun);
            },
            createTestItem(id, label, uri) {
                return new TestItemImpl(controllerId, id, label, uri);
            },
            createTestRun: (request, name, persist = true) => {
                return this.runTracker.createTestRun(extension, controllerId, collection, request, name, persist);
            },
            invalidateTestResults: items => {
                if (items === undefined) {
                    this.proxy.$markTestRetired(undefined);
                }
                else {
                    const itemsArr = items instanceof Array ? items : [items];
                    this.proxy.$markTestRetired(itemsArr.map(i => TestId.fromExtHostTestItem(i, controllerId).toString()));
                }
            },
            set resolveHandler(fn) {
                collection.resolveHandler = fn;
            },
            get resolveHandler() {
                return collection.resolveHandler;
            },
            dispose: () => {
                disposable.dispose();
            },
        };
        const info = { controller, collection, profiles, extension, activeProfiles };
        proxy.$registerTestController(controllerId, label, getCapability());
        disposable.add(toDisposable(() => proxy.$unregisterTestController(controllerId)));
        this.controllers.set(controllerId, info);
        disposable.add(toDisposable(() => this.controllers.delete(controllerId)));
        disposable.add(collection.onDidGenerateDiff(diff => proxy.$publishDiff(controllerId, diff.map(TestsDiffOp.serialize))));
        return controller;
    }
    /**
     * Implements vscode.test.createTestObserver
     */
    createTestObserver() {
        return this.observer.checkout();
    }
    /**
     * Implements vscode.test.runTests
     */
    async runTests(req, token = CancellationToken.None) {
        const profile = tryGetProfileFromTestRunReq(req);
        if (!profile) {
            throw new Error('The request passed to `vscode.test.runTests` must include a profile');
        }
        const controller = this.controllers.get(profile.controllerId);
        if (!controller) {
            throw new Error('Controller not found');
        }
        await this.proxy.$runTests({
            preserveFocus: req.preserveFocus ?? true,
            group: Convert.TestRunProfileKind.from(profile.kind),
            targets: [{
                    testIds: req.include?.map(t => TestId.fromExtHostTestItem(t, controller.collection.root.id).toString()) ?? [controller.collection.root.id],
                    profileId: profile.profileId,
                    controllerId: profile.controllerId,
                }],
            exclude: req.exclude?.map(t => t.id),
        }, token);
    }
    /**
     * Implements vscode.test.registerTestFollowupProvider
     */
    registerTestFollowupProvider(provider) {
        this.followupProviders.add(provider);
        return { dispose: () => { this.followupProviders.delete(provider); } };
    }
    //#endregion
    //#region RPC methods
    /**
     * @inheritdoc
     */
    async $getTestsRelatedToCode(uri, _position, token) {
        const doc = this.editors.getDocument(URI.revive(uri));
        if (!doc) {
            return [];
        }
        const position = Convert.Position.to(_position);
        const related = [];
        await Promise.all([...this.controllers.values()].map(async (c) => {
            let tests;
            try {
                tests = await c.relatedCodeProvider?.provideRelatedTests?.(doc.document, position, token);
            }
            catch (e) {
                if (!token.isCancellationRequested) {
                    this.logService.warn(`Error thrown while providing related tests for ${c.controller.label}`, e);
                }
            }
            if (tests) {
                for (const test of tests) {
                    related.push(TestId.fromExtHostTestItem(test, c.controller.id).toString());
                }
                c.collection.flushDiff();
            }
        }));
        return related;
    }
    /**
     * @inheritdoc
     */
    async $getCodeRelatedToTest(testId, token) {
        const controller = this.controllers.get(TestId.root(testId));
        if (!controller) {
            return [];
        }
        const test = controller.collection.tree.get(testId);
        if (!test) {
            return [];
        }
        const locations = await controller.relatedCodeProvider?.provideRelatedCode?.(test.actual, token);
        return locations?.map(Convert.location.from) ?? [];
    }
    /**
     * @inheritdoc
     */
    $syncTests() {
        for (const { collection } of this.controllers.values()) {
            collection.flushDiff();
        }
        return Promise.resolve();
    }
    /**
     * @inheritdoc
     */
    async $getCoverageDetails(coverageId, testId, token) {
        const details = await this.runTracker.getCoverageDetails(coverageId, testId, token);
        return details?.map(Convert.TestCoverage.fromDetails);
    }
    /**
     * @inheritdoc
     */
    async $disposeRun(runId) {
        this.runTracker.disposeTestRun(runId);
    }
    /** @inheritdoc */
    $configureRunProfile(controllerId, profileId) {
        this.controllers.get(controllerId)?.profiles.get(profileId)?.configureHandler?.();
    }
    /** @inheritdoc */
    $setDefaultRunProfiles(profiles) {
        const evt = new Map();
        for (const [controllerId, profileIds] of Object.entries(profiles)) {
            const ctrl = this.controllers.get(controllerId);
            if (!ctrl) {
                continue;
            }
            const changes = new Map();
            const added = profileIds.filter(id => !ctrl.activeProfiles.has(id));
            const removed = [...ctrl.activeProfiles].filter(id => !profileIds.includes(id));
            for (const id of added) {
                changes.set(id, true);
                ctrl.activeProfiles.add(id);
            }
            for (const id of removed) {
                changes.set(id, false);
                ctrl.activeProfiles.delete(id);
            }
            if (changes.size) {
                evt.set(controllerId, changes);
            }
        }
        this.defaultProfilesChangedEmitter.fire(evt);
    }
    /** @inheritdoc */
    async $refreshTests(controllerId, token) {
        await this.controllers.get(controllerId)?.controller.refreshHandler?.(token);
    }
    /**
     * Updates test results shown to extensions.
     * @override
     */
    $publishTestResults(results) {
        this.results = Object.freeze(results
            .map(r => {
            const o = Convert.TestResults.to(r);
            const taskWithCoverage = r.tasks.findIndex(t => t.hasCoverage);
            if (taskWithCoverage !== -1) {
                o.getDetailedCoverage = (uri, token = CancellationToken.None) => this.proxy.$getCoverageDetails(r.id, taskWithCoverage, uri, token).then(r => r.map(Convert.TestCoverage.to));
            }
            testResultInternalIDs.set(o, r.id);
            return o;
        })
            .concat(this.results)
            .sort((a, b) => b.completedAt - a.completedAt)
            .slice(0, 32));
        this.resultsChangedEmitter.fire();
    }
    /**
     * Expands the nodes in the test tree. If levels is less than zero, it will
     * be treated as infinite.
     */
    async $expandTest(testId, levels) {
        const collection = this.controllers.get(TestId.fromString(testId).controllerId)?.collection;
        if (collection) {
            await collection.expand(testId, levels < 0 ? Infinity : levels);
            collection.flushDiff();
        }
    }
    /**
     * Receives a test update from the main thread. Called (eventually) whenever
     * tests change.
     */
    $acceptDiff(diff) {
        this.observer.applyDiff(diff.map(d => TestsDiffOp.deserialize({ asCanonicalUri: u => u }, d)));
    }
    /**
     * Runs tests with the given set of IDs. Allows for test from multiple
     * providers to be run.
     * @inheritdoc
     */
    async $runControllerTests(reqs, token) {
        return Promise.all(reqs.map(req => this.runControllerTestRequest(req, false, token)));
    }
    /**
     * Starts continuous test runs with the given set of IDs. Allows for test from
     * multiple providers to be run.
     * @inheritdoc
     */
    async $startContinuousRun(reqs, token) {
        const cts = new CancellationTokenSource(token);
        const res = await Promise.all(reqs.map(req => this.runControllerTestRequest(req, true, cts.token)));
        // avoid returning until cancellation is requested, otherwise ipc disposes of the token
        if (!token.isCancellationRequested && !res.some(r => r.error)) {
            await new Promise(r => token.onCancellationRequested(r));
        }
        cts.dispose(true);
        return res;
    }
    /** @inheritdoc */
    async $provideTestFollowups(req, token) {
        const results = this.results.find(r => testResultInternalIDs.get(r) === req.resultId);
        const test = results && findTestInResultSnapshot(TestId.fromString(req.extId), results?.results);
        if (!test) {
            return [];
        }
        let followups = [];
        await Promise.all([...this.followupProviders].map(async (provider) => {
            try {
                const r = await provider.provideFollowup(results, test, req.taskIndex, req.messageIndex, token);
                if (r) {
                    followups = followups.concat(r);
                }
            }
            catch (e) {
                this.logService.error(`Error thrown while providing followup for test message`, e);
            }
        }));
        if (token.isCancellationRequested) {
            return [];
        }
        return followups.map(command => {
            const id = followupCounter++;
            this.testFollowups.set(id, command);
            return { title: command.title, id };
        });
    }
    $disposeTestFollowups(id) {
        for (const i of id) {
            this.testFollowups.delete(i);
        }
    }
    $executeTestFollowup(id) {
        const command = this.testFollowups.get(id);
        if (!command) {
            return Promise.resolve();
        }
        return this.commands.executeCommand(command.command, ...(command.arguments || []));
    }
    /**
     * Cancels an ongoing test run.
     */
    $cancelExtensionTestRun(runId, taskId) {
        if (runId === undefined) {
            this.runTracker.cancelAllRuns();
        }
        else {
            this.runTracker.cancelRunById(runId, taskId);
        }
    }
    //#endregion
    getMetadataForRun(run) {
        for (const tracker of this.runTracker.trackers) {
            const taskId = tracker.getTaskIdForRun(run);
            if (taskId) {
                return { taskId, runId: tracker.id };
            }
        }
        return undefined;
    }
    async runControllerTestRequest(req, isContinuous, token) {
        const lookup = this.controllers.get(req.controllerId);
        if (!lookup) {
            return {};
        }
        const { collection, profiles, extension } = lookup;
        const profile = profiles.get(req.profileId);
        if (!profile) {
            return {};
        }
        const includeTests = req.testIds
            .map((testId) => collection.tree.get(testId))
            .filter(isDefined);
        const excludeTests = req.excludeExtIds
            .map(id => lookup.collection.tree.get(id))
            .filter(isDefined)
            .filter(exclude => includeTests.some(include => include.fullId.compare(exclude.fullId) === 2 /* TestPosition.IsChild */));
        if (!includeTests.length) {
            return {};
        }
        const publicReq = new TestRunRequest(includeTests.some(i => i.actual instanceof TestItemRootImpl) ? undefined : includeTests.map(t => t.actual), excludeTests.map(t => t.actual), profile, isContinuous);
        const tracker = isStartControllerTests(req) && this.runTracker.prepareForMainThreadTestRun(extension, publicReq, TestRunDto.fromInternal(req, lookup.collection), profile, token);
        try {
            await profile.runHandler(publicReq, token);
            return {};
        }
        catch (e) {
            return { error: String(e) };
        }
        finally {
            if (tracker) {
                if (tracker.hasRunningTasks && !token.isCancellationRequested) {
                    await Event.toPromise(tracker.onEnd);
                }
            }
        }
    }
};
ExtHostTesting = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, ILogService),
    __param(2, IExtHostCommands),
    __param(3, IExtHostDocumentsAndEditors)
], ExtHostTesting);
export { ExtHostTesting };
// Deadline after being requested by a user that a test run is forcibly cancelled.
const RUN_CANCEL_DEADLINE = 10_000;
var TestRunTrackerState;
(function (TestRunTrackerState) {
    // Default state
    TestRunTrackerState[TestRunTrackerState["Running"] = 0] = "Running";
    // Cancellation is requested, but the run is still going.
    TestRunTrackerState[TestRunTrackerState["Cancelling"] = 1] = "Cancelling";
    // All tasks have ended
    TestRunTrackerState[TestRunTrackerState["Ended"] = 2] = "Ended";
})(TestRunTrackerState || (TestRunTrackerState = {}));
class TestRunTracker extends Disposable {
    /**
     * Gets whether there are any tests running.
     */
    get hasRunningTasks() {
        return this.running > 0;
    }
    /**
     * Gets the run ID.
     */
    get id() {
        return this.dto.id;
    }
    constructor(dto, proxy, logService, profile, extension, parentToken) {
        super();
        this.dto = dto;
        this.proxy = proxy;
        this.logService = logService;
        this.profile = profile;
        this.extension = extension;
        this.state = 0 /* TestRunTrackerState.Running */;
        this.running = 0;
        this.tasks = new Map();
        this.sharedTestIds = new Set();
        this.endEmitter = this._register(new Emitter());
        this.publishedCoverage = new Map();
        /**
         * Fires when a test ends, and no more tests are left running.
         */
        this.onEnd = this.endEmitter.event;
        this.cts = this._register(new CancellationTokenSource(parentToken));
        const forciblyEnd = this._register(new RunOnceScheduler(() => this.forciblyEndTasks(), RUN_CANCEL_DEADLINE));
        this._register(this.cts.token.onCancellationRequested(() => forciblyEnd.schedule()));
        const didDisposeEmitter = new Emitter();
        this.onDidDispose = didDisposeEmitter.event;
        this._register(toDisposable(() => {
            didDisposeEmitter.fire();
            didDisposeEmitter.dispose();
        }));
    }
    /** Gets the task ID from a test run object. */
    getTaskIdForRun(run) {
        for (const [taskId, { run: r }] of this.tasks) {
            if (r === run) {
                return taskId;
            }
        }
        return undefined;
    }
    /** Requests cancellation of the run. On the second call, forces cancellation. */
    cancel(taskId) {
        if (taskId) {
            this.tasks.get(taskId)?.cts.cancel();
        }
        else if (this.state === 0 /* TestRunTrackerState.Running */) {
            this.cts.cancel();
            this.state = 1 /* TestRunTrackerState.Cancelling */;
        }
        else if (this.state === 1 /* TestRunTrackerState.Cancelling */) {
            this.forciblyEndTasks();
        }
    }
    /** Gets details for a previously-emitted coverage object. */
    async getCoverageDetails(id, testId, token) {
        const [, taskId] = TestId.fromString(id).path; /** runId, taskId, URI */
        const coverage = this.publishedCoverage.get(id);
        if (!coverage) {
            return [];
        }
        const { report, extIds } = coverage;
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error('unreachable: run task was not found');
        }
        let testItem;
        if (testId && report instanceof FileCoverage) {
            const index = extIds.indexOf(testId);
            if (index === -1) {
                return []; // ??
            }
            testItem = report.includesTests[index];
        }
        const details = testItem
            ? this.profile?.loadDetailedCoverageForTest?.(task.run, report, testItem, token)
            : this.profile?.loadDetailedCoverage?.(task.run, report, token);
        return (await details) ?? [];
    }
    /** Creates the public test run interface to give to extensions. */
    createRun(name) {
        const runId = this.dto.id;
        const ctrlId = this.dto.controllerId;
        const taskId = generateUuid();
        const guardTestMutation = (fn) => (test, ...args) => {
            if (ended) {
                this.logService.warn(`Setting the state of test "${test.id}" is a no-op after the run ends.`);
                return;
            }
            this.ensureTestIsKnown(test);
            fn(test, ...args);
        };
        const appendMessages = (test, messages) => {
            const converted = messages instanceof Array
                ? messages.map(Convert.TestMessage.from)
                : [Convert.TestMessage.from(messages)];
            if (test.uri && test.range) {
                const defaultLocation = { range: Convert.Range.from(test.range), uri: test.uri };
                for (const message of converted) {
                    message.location = message.location || defaultLocation;
                }
            }
            this.proxy.$appendTestMessagesInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), converted);
        };
        let ended = false;
        // tasks are alive for as long as the tracker is alive, so simple this._register is fine:
        const cts = this._register(new CancellationTokenSource(this.cts.token));
        // one-off map used to associate test items with incrementing IDs in `addCoverage`.
        // There's no need to include their entire ID, we just want to make sure they're
        // stable and unique. Normal map is okay since TestRun lifetimes are limited.
        const run = {
            isPersisted: this.dto.isPersisted,
            token: cts.token,
            name,
            onDidDispose: this.onDidDispose,
            addCoverage: (coverage) => {
                if (ended) {
                    return;
                }
                const includesTests = coverage instanceof FileCoverage ? coverage.includesTests : [];
                if (includesTests.length) {
                    for (const test of includesTests) {
                        this.ensureTestIsKnown(test);
                    }
                }
                const uriStr = coverage.uri.toString();
                const id = new TestId([runId, taskId, uriStr]).toString();
                // it's a lil funky, but it's possible for a test item's ID to change after
                // it's been reported if it's rehomed under a different parent. Record its
                // ID at the time when the coverage report is generated so we can reference
                // it later if needeed.
                this.publishedCoverage.set(id, { report: coverage, extIds: includesTests.map(t => TestId.fromExtHostTestItem(t, ctrlId).toString()) });
                this.proxy.$appendCoverage(runId, taskId, Convert.TestCoverage.fromFile(ctrlId, id, coverage));
            },
            //#region state mutation
            enqueued: guardTestMutation(test => {
                this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), 1 /* TestResultState.Queued */);
            }),
            skipped: guardTestMutation(test => {
                this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), 5 /* TestResultState.Skipped */);
            }),
            started: guardTestMutation(test => {
                this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), 2 /* TestResultState.Running */);
            }),
            errored: guardTestMutation((test, messages, duration) => {
                appendMessages(test, messages);
                this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), 6 /* TestResultState.Errored */, duration);
            }),
            failed: guardTestMutation((test, messages, duration) => {
                appendMessages(test, messages);
                this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), 4 /* TestResultState.Failed */, duration);
            }),
            passed: guardTestMutation((test, duration) => {
                this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, this.dto.controllerId).toString(), 3 /* TestResultState.Passed */, duration);
            }),
            //#endregion
            appendOutput: (output, location, test) => {
                if (ended) {
                    return;
                }
                if (test) {
                    this.ensureTestIsKnown(test);
                }
                this.proxy.$appendOutputToRun(runId, taskId, VSBuffer.fromString(output), location && Convert.location.from(location), test && TestId.fromExtHostTestItem(test, ctrlId).toString());
            },
            end: () => {
                if (ended) {
                    return;
                }
                ended = true;
                this.proxy.$finishedTestRunTask(runId, taskId);
                if (!--this.running) {
                    this.markEnded();
                }
            }
        };
        this.running++;
        this.tasks.set(taskId, { run, cts });
        this.proxy.$startedTestRunTask(runId, {
            id: taskId,
            ctrlId: this.dto.controllerId,
            name: name || this.extension.displayName || this.extension.identifier.value,
            running: true,
        });
        return run;
    }
    forciblyEndTasks() {
        for (const { run } of this.tasks.values()) {
            run.end();
        }
    }
    markEnded() {
        if (this.state !== 2 /* TestRunTrackerState.Ended */) {
            this.state = 2 /* TestRunTrackerState.Ended */;
            this.endEmitter.fire();
        }
    }
    ensureTestIsKnown(test) {
        if (!(test instanceof TestItemImpl)) {
            throw new InvalidTestItemError(test.id);
        }
        if (this.sharedTestIds.has(TestId.fromExtHostTestItem(test, this.dto.controllerId).toString())) {
            return;
        }
        const chain = [];
        const root = this.dto.colllection.root;
        while (true) {
            const converted = Convert.TestItem.from(test);
            chain.unshift(converted);
            if (this.sharedTestIds.has(converted.extId)) {
                break;
            }
            this.sharedTestIds.add(converted.extId);
            if (test === root) {
                break;
            }
            test = test.parent || root;
        }
        this.proxy.$addTestsToRun(this.dto.controllerId, this.dto.id, chain);
    }
    dispose() {
        this.markEnded();
        super.dispose();
    }
}
/**
 * Queues runs for a single extension and provides the currently-executing
 * run so that `createTestRun` can be properly correlated.
 */
export class TestRunCoordinator {
    get trackers() {
        return this.tracked.values();
    }
    constructor(proxy, logService) {
        this.proxy = proxy;
        this.logService = logService;
        this.tracked = new Map();
        this.trackedById = new Map();
    }
    /**
     * Gets a coverage report for a given run and task ID.
     */
    getCoverageDetails(id, testId, token) {
        const runId = TestId.root(id);
        return this.trackedById.get(runId)?.getCoverageDetails(id, testId, token) || [];
    }
    /**
     * Disposes the test run, called when the main thread is no longer interested
     * in associated data.
     */
    disposeTestRun(runId) {
        this.trackedById.get(runId)?.dispose();
        this.trackedById.delete(runId);
        for (const [req, { id }] of this.tracked) {
            if (id === runId) {
                this.tracked.delete(req);
            }
        }
    }
    /**
     * Registers a request as being invoked by the main thread, so
     * `$startedExtensionTestRun` is not invoked. The run must eventually
     * be cancelled manually.
     */
    prepareForMainThreadTestRun(extension, req, dto, profile, token) {
        return this.getTracker(req, dto, profile, extension, token);
    }
    /**
     * Cancels an existing test run via its cancellation token.
     */
    cancelRunById(runId, taskId) {
        this.trackedById.get(runId)?.cancel(taskId);
    }
    /**
     * Cancels an existing test run via its cancellation token.
     */
    cancelAllRuns() {
        for (const tracker of this.tracked.values()) {
            tracker.cancel();
        }
    }
    /**
     * Implements the public `createTestRun` API.
     */
    createTestRun(extension, controllerId, collection, request, name, persist) {
        const existing = this.tracked.get(request);
        if (existing) {
            return existing.createRun(name);
        }
        // If there is not an existing tracked extension for the request, start
        // a new, detached session.
        const dto = TestRunDto.fromPublic(controllerId, collection, request, persist);
        const profile = tryGetProfileFromTestRunReq(request);
        this.proxy.$startedExtensionTestRun({
            controllerId,
            continuous: !!request.continuous,
            profile: profile && { group: Convert.TestRunProfileKind.from(profile.kind), id: profile.profileId },
            exclude: request.exclude?.map(t => TestId.fromExtHostTestItem(t, collection.root.id).toString()) ?? [],
            id: dto.id,
            include: request.include?.map(t => TestId.fromExtHostTestItem(t, collection.root.id).toString()) ?? [collection.root.id],
            preserveFocus: request.preserveFocus ?? true,
            persist
        });
        const tracker = this.getTracker(request, dto, request.profile, extension);
        Event.once(tracker.onEnd)(() => {
            this.proxy.$finishedExtensionTestRun(dto.id);
        });
        return tracker.createRun(name);
    }
    getTracker(req, dto, profile, extension, token) {
        const tracker = new TestRunTracker(dto, this.proxy, this.logService, profile, extension, token);
        this.tracked.set(req, tracker);
        this.trackedById.set(tracker.id, tracker);
        return tracker;
    }
}
const tryGetProfileFromTestRunReq = (request) => {
    if (!request.profile) {
        return undefined;
    }
    if (!(request.profile instanceof TestRunProfileImpl)) {
        throw new Error(`TestRunRequest.profile is not an instance created from TestController.createRunProfile`);
    }
    return request.profile;
};
export class TestRunDto {
    static fromPublic(controllerId, collection, request, persist) {
        return new TestRunDto(controllerId, generateUuid(), persist, collection);
    }
    static fromInternal(request, collection) {
        return new TestRunDto(request.controllerId, request.runId, true, collection);
    }
    constructor(controllerId, id, isPersisted, colllection) {
        this.controllerId = controllerId;
        this.id = id;
        this.isPersisted = isPersisted;
        this.colllection = colllection;
    }
}
class MirroredChangeCollector {
    get isEmpty() {
        return this.added.size === 0 && this.removed.size === 0 && this.updated.size === 0;
    }
    constructor(emitter) {
        this.emitter = emitter;
        this.added = new Set();
        this.updated = new Set();
        this.removed = new Set();
        this.alreadyRemoved = new Set();
    }
    /**
     * @inheritdoc
     */
    add(node) {
        this.added.add(node);
    }
    /**
     * @inheritdoc
     */
    update(node) {
        Object.assign(node.revived, Convert.TestItem.toPlain(node.item));
        if (!this.added.has(node)) {
            this.updated.add(node);
        }
    }
    /**
     * @inheritdoc
     */
    remove(node) {
        if (this.added.delete(node)) {
            return;
        }
        this.updated.delete(node);
        const parentId = TestId.parentId(node.item.extId);
        if (parentId && this.alreadyRemoved.has(parentId.toString())) {
            this.alreadyRemoved.add(node.item.extId);
            return;
        }
        this.removed.add(node);
    }
    /**
     * @inheritdoc
     */
    getChangeEvent() {
        const { added, updated, removed } = this;
        return {
            get added() { return [...added].map(n => n.revived); },
            get updated() { return [...updated].map(n => n.revived); },
            get removed() { return [...removed].map(n => n.revived); },
        };
    }
    complete() {
        if (!this.isEmpty) {
            this.emitter.fire(this.getChangeEvent());
        }
    }
}
/**
 * Maintains tests in this extension host sent from the main thread.
 * @private
 */
class MirroredTestCollection extends AbstractIncrementalTestCollection {
    constructor() {
        super(...arguments);
        this.changeEmitter = new Emitter();
        /**
         * Change emitter that fires with the same semantics as `TestObserver.onDidChangeTests`.
         */
        this.onDidChangeTests = this.changeEmitter.event;
    }
    /**
     * Gets a list of root test items.
     */
    get rootTests() {
        return this.roots;
    }
    /**
     *
     * If the test ID exists, returns its underlying ID.
     */
    getMirroredTestDataById(itemId) {
        return this.items.get(itemId);
    }
    /**
     * If the test item is a mirrored test item, returns its underlying ID.
     */
    getMirroredTestDataByReference(item) {
        return this.items.get(item.id);
    }
    /**
     * @override
     */
    createItem(item, parent) {
        return {
            ...item,
            // todo@connor4312: make this work well again with children
            revived: Convert.TestItem.toPlain(item.item),
            depth: parent ? parent.depth + 1 : 0,
            children: new Set(),
        };
    }
    /**
     * @override
     */
    createChangeCollector() {
        return new MirroredChangeCollector(this.changeEmitter);
    }
}
class TestObservers {
    constructor(proxy) {
        this.proxy = proxy;
    }
    checkout() {
        if (!this.current) {
            this.current = this.createObserverData();
        }
        const current = this.current;
        current.observers++;
        return {
            onDidChangeTest: current.tests.onDidChangeTests,
            get tests() { return [...current.tests.rootTests].map(t => t.revived); },
            dispose: createSingleCallFunction(() => {
                if (--current.observers === 0) {
                    this.proxy.$unsubscribeFromDiffs();
                    this.current = undefined;
                }
            }),
        };
    }
    /**
     * Gets the internal test data by its reference.
     */
    getMirroredTestDataByReference(ref) {
        return this.current?.tests.getMirroredTestDataByReference(ref);
    }
    /**
     * Applies test diffs to the current set of observed tests.
     */
    applyDiff(diff) {
        this.current?.tests.apply(diff);
    }
    createObserverData() {
        const tests = new MirroredTestCollection({ asCanonicalUri: u => u });
        this.proxy.$subscribeToDiffs();
        return { observers: 0, tests, };
    }
}
const updateProfile = (impl, proxy, initial, update) => {
    if (initial) {
        Object.assign(initial, update);
    }
    else {
        proxy.$updateTestRunConfig(impl.controllerId, impl.profileId, update);
    }
};
export class TestRunProfileImpl extends TestRunProfileBase {
    #proxy;
    #activeProfiles;
    #onDidChangeDefaultProfiles;
    #initialPublish;
    #profiles;
    get label() {
        return this._label;
    }
    set label(label) {
        if (label !== this._label) {
            this._label = label;
            updateProfile(this, this.#proxy, this.#initialPublish, { label });
        }
    }
    get supportsContinuousRun() {
        return this._supportsContinuousRun;
    }
    set supportsContinuousRun(supports) {
        if (supports !== this._supportsContinuousRun) {
            this._supportsContinuousRun = supports;
            updateProfile(this, this.#proxy, this.#initialPublish, { supportsContinuousRun: supports });
        }
    }
    get isDefault() {
        return this.#activeProfiles.has(this.profileId);
    }
    set isDefault(isDefault) {
        if (isDefault !== this.isDefault) {
            // #activeProfiles is synced from the main thread, so we can make
            // provisional changes here that will get confirmed momentarily
            if (isDefault) {
                this.#activeProfiles.add(this.profileId);
            }
            else {
                this.#activeProfiles.delete(this.profileId);
            }
            updateProfile(this, this.#proxy, this.#initialPublish, { isDefault });
        }
    }
    get tag() {
        return this._tag;
    }
    set tag(tag) {
        if (tag?.id !== this._tag?.id) {
            this._tag = tag;
            updateProfile(this, this.#proxy, this.#initialPublish, {
                tag: tag ? Convert.TestTag.namespace(this.controllerId, tag.id) : null,
            });
        }
    }
    get configureHandler() {
        return this._configureHandler;
    }
    set configureHandler(handler) {
        if (handler !== this._configureHandler) {
            this._configureHandler = handler;
            updateProfile(this, this.#proxy, this.#initialPublish, { hasConfigurationHandler: !!handler });
        }
    }
    get onDidChangeDefault() {
        return Event.chain(this.#onDidChangeDefaultProfiles, $ => $
            .map(ev => ev.get(this.controllerId)?.get(this.profileId))
            .filter(isDefined));
    }
    constructor(proxy, profiles, activeProfiles, onDidChangeActiveProfiles, controllerId, profileId, _label, kind, runHandler, _isDefault = false, _tag = undefined, _supportsContinuousRun = false) {
        super(controllerId, profileId, kind);
        this._label = _label;
        this.runHandler = runHandler;
        this._tag = _tag;
        this._supportsContinuousRun = _supportsContinuousRun;
        this.#proxy = proxy;
        this.#profiles = profiles;
        this.#activeProfiles = activeProfiles;
        this.#onDidChangeDefaultProfiles = onDidChangeActiveProfiles;
        profiles.set(profileId, this);
        const groupBitset = Convert.TestRunProfileKind.from(kind);
        if (_isDefault) {
            activeProfiles.add(profileId);
        }
        this.#initialPublish = {
            profileId: profileId,
            controllerId,
            tag: _tag ? Convert.TestTag.namespace(this.controllerId, _tag.id) : null,
            label: _label,
            group: groupBitset,
            isDefault: _isDefault,
            hasConfigurationHandler: false,
            supportsContinuousRun: _supportsContinuousRun,
        };
        // we send the initial profile publish out on the next microtask so that
        // initially setting the isDefault value doesn't overwrite a user-configured value
        queueMicrotask(() => {
            if (this.#initialPublish) {
                this.#proxy.$publishTestRunProfile(this.#initialPublish);
                this.#initialPublish = undefined;
            }
        });
    }
    dispose() {
        if (this.#profiles?.delete(this.profileId)) {
            this.#profiles = undefined;
            this.#proxy.$removeTestProfile(this.controllerId, this.profileId);
        }
        this.#initialPublish = undefined;
    }
}
function findTestInResultSnapshot(extId, snapshot) {
    for (let i = 0; i < extId.path.length; i++) {
        const item = snapshot.find(s => s.id === extId.path[i]);
        if (!item) {
            return undefined;
        }
        if (i === extId.path.length - 1) {
            return item;
        }
        snapshot = item.children;
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRlc3RpbmcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0VGVzdGluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDMUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDcEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFOUYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzFELE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sNkJBQTZCLENBQUM7QUFDakUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRzVELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFbEUsT0FBTyxFQUFFLE1BQU0sRUFBZ0IsTUFBTSx3Q0FBd0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsaUNBQWlDLEVBQTBZLFdBQVcsRUFBRSxzQkFBc0IsRUFB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