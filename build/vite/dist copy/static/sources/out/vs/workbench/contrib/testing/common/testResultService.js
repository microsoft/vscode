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
import { findFirstIdxMonotonousOrArrLen } from '../../../../base/common/arraysFind.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { TestingContextKeys } from './testingContextKeys.js';
import { ITestProfileService } from './testProfileService.js';
import { LiveTestResult } from './testResult.js';
import { ITestResultStorage, RETAIN_MAX_RESULTS } from './testResultStorage.js';
const isRunningTests = (service) => service.results.length > 0 && service.results[0].completedAt === undefined;
export const ITestResultService = createDecorator('testResultService');
let TestResultService = class TestResultService extends Disposable {
    /**
     * @inheritdoc
     */
    get results() {
        this.loadResults();
        return this._results;
    }
    constructor(contextKeyService, storage, testProfiles, telemetryService) {
        super();
        this.storage = storage;
        this.testProfiles = testProfiles;
        this.telemetryService = telemetryService;
        this.changeResultEmitter = this._register(new Emitter());
        this._results = [];
        this._resultsDisposables = [];
        this.testChangeEmitter = this._register(new Emitter());
        this.insertOrderCounter = 0;
        /**
         * @inheritdoc
         */
        this.onResultsChanged = this.changeResultEmitter.event;
        /**
         * @inheritdoc
         */
        this.onTestChanged = this.testChangeEmitter.event;
        this.loadResults = createSingleCallFunction(() => this.storage.read().then(loaded => {
            for (let i = loaded.length - 1; i >= 0; i--) {
                this.push(loaded[i]);
            }
        }));
        this.persistScheduler = this._register(new RunOnceScheduler(() => this.persistImmediately(), 500));
        this._register(toDisposable(() => dispose(this._resultsDisposables)));
        this.isRunning = TestingContextKeys.isRunning.bindTo(contextKeyService);
        this.hasAnyResults = TestingContextKeys.hasAnyResults.bindTo(contextKeyService);
    }
    /**
     * @inheritdoc
     */
    getStateById(extId) {
        for (const result of this.results) {
            const lookup = result.getStateById(extId);
            if (lookup && lookup.computedState !== 0 /* TestResultState.Unset */) {
                return [result, lookup];
            }
        }
        return undefined;
    }
    /**
     * @inheritdoc
     */
    createLiveResult(req) {
        if ('targets' in req) {
            const id = generateUuid();
            return this.push(new LiveTestResult(id, true, req, this.insertOrderCounter++, this.telemetryService));
        }
        let profile;
        if (req.profile) {
            const profiles = this.testProfiles.getControllerProfiles(req.controllerId);
            profile = profiles.find(c => c.profileId === req.profile.id);
        }
        const resolved = {
            preserveFocus: req.preserveFocus,
            targets: [],
            exclude: req.exclude,
            continuous: req.continuous,
            group: profile?.group ?? 2 /* TestRunProfileBitset.Run */,
        };
        if (profile) {
            resolved.targets.push({
                profileId: profile.profileId,
                controllerId: req.controllerId,
                testIds: req.include,
            });
        }
        return this.push(new LiveTestResult(req.id, req.persist, resolved, this.insertOrderCounter++, this.telemetryService));
    }
    /**
     * @inheritdoc
     */
    push(result) {
        if (result.completedAt === undefined) {
            this.results.unshift(result);
        }
        else {
            const index = findFirstIdxMonotonousOrArrLen(this.results, r => r.completedAt !== undefined && r.completedAt <= result.completedAt);
            this.results.splice(index, 0, result);
            this.persistScheduler.schedule();
        }
        this.hasAnyResults.set(true);
        if (this.results.length > RETAIN_MAX_RESULTS) {
            this.results.pop();
            this._resultsDisposables.pop()?.dispose();
        }
        const ds = new DisposableStore();
        this._resultsDisposables.push(ds);
        if (result instanceof LiveTestResult) {
            ds.add(result);
            ds.add(result.onComplete(() => this.onComplete(result)));
            ds.add(result.onChange(this.testChangeEmitter.fire, this.testChangeEmitter));
            this.isRunning.set(true);
            this.changeResultEmitter.fire({ started: result });
        }
        else {
            this.changeResultEmitter.fire({ inserted: result });
            // If this is not a new result, go through each of its tests. For each
            // test for which the new result is the most recently inserted, fir
            // a change event so that UI updates.
            for (const item of result.tests) {
                for (const otherResult of this.results) {
                    if (otherResult === result) {
                        this.testChangeEmitter.fire({ item, result, reason: 0 /* TestResultItemChangeReason.ComputedStateChange */ });
                        break;
                    }
                    else if (otherResult.getStateById(item.item.extId) !== undefined) {
                        break;
                    }
                }
            }
        }
        return result;
    }
    /**
     * @inheritdoc
     */
    getResult(id) {
        return this.results.find(r => r.id === id);
    }
    /**
     * @inheritdoc
     */
    clear() {
        const keep = [];
        const removed = [];
        for (const result of this.results) {
            if (result.completedAt !== undefined) {
                removed.push(result);
            }
            else {
                keep.push(result);
            }
        }
        this._results = keep;
        this.persistScheduler.schedule();
        if (keep.length === 0) {
            this.hasAnyResults.set(false);
        }
        this.changeResultEmitter.fire({ removed });
    }
    onComplete(result) {
        this.resort();
        this.updateIsRunning();
        this.persistScheduler.schedule();
        this.changeResultEmitter.fire({ completed: result });
    }
    resort() {
        this.results.sort((a, b) => {
            // Running tests should always be sorted higher:
            if (!!a.completedAt !== !!b.completedAt) {
                return a.completedAt === undefined ? -1 : 1;
            }
            // Otherwise sort by insertion order, hydrated tests are always last:
            const aComp = a instanceof LiveTestResult ? a.insertOrder : -1;
            const bComp = b instanceof LiveTestResult ? b.insertOrder : -1;
            return bComp - aComp;
        });
    }
    updateIsRunning() {
        this.isRunning.set(isRunningTests(this));
    }
    async persistImmediately() {
        // ensure results are loaded before persisting to avoid deleting once
        // that we don't have yet.
        await this.loadResults();
        this.storage.persist(this.results);
    }
};
TestResultService = __decorate([
    __param(0, IContextKeyService),
    __param(1, ITestResultStorage),
    __param(2, ITestProfileService),
    __param(3, ITelemetryService)
], TestResultService);
export { TestResultService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFJlc3VsdFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXN0aW5nL2NvbW1vbi90ZXN0UmVzdWx0U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN2RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakYsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzFHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDN0QsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDOUQsT0FBTyxFQUFlLGNBQWMsRUFBb0QsTUFBTSxpQkFBaUIsQ0FBQztBQUNoSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQW9EaEYsTUFBTSxjQUFjLEdBQUcsQ0FBQyxPQUEyQixFQUFFLEVBQUUsQ0FDdEQsT0FBTyxDQUFDLE9BQU8sQ0FB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