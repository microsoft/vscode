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
import * as arrays from '../../../../base/common/arrays.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorunIterableDelta, observableValue } from '../../../../base/common/observable.js';
import { WellDefinedPrefixTree } from '../../../../base/common/prefixTree.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { StoredValue } from './storedValue.js';
import { TestId } from './testId.js';
import { TestingContextKeys } from './testingContextKeys.js';
import { ITestProfileService } from './testProfileService.js';
import { ITestService } from './testService.js';
export const ITestingContinuousRunService = createDecorator('testingContinuousRunService');
let TestingContinuousRunService = class TestingContinuousRunService extends Disposable {
    get lastRunProfileIds() {
        return this.lastRun.get(new Set());
    }
    constructor(testService, storageService, contextKeyService, testProfileService) {
        super();
        this.testService = testService;
        this.testProfileService = testProfileService;
        this.changeEmitter = this._register(new Emitter());
        this.running = new WellDefinedPrefixTree();
        this.onDidChange = this.changeEmitter.event;
        const isGloballyOn = TestingContextKeys.isContinuousModeOn.bindTo(contextKeyService);
        this._register(this.onDidChange(() => {
            isGloballyOn.set(!!this.running.root.value);
        }));
        this.lastRun = this._register(new StoredValue({
            key: 'lastContinuousRunProfileIds',
            scope: 1 /* StorageScope.WORKSPACE */,
            target: 1 /* StorageTarget.MACHINE */,
            serialization: {
                deserialize: v => new Set(JSON.parse(v)),
                serialize: v => JSON.stringify([...v])
            },
        }, storageService));
        this._register(toDisposable(() => {
            for (const cts of this.running.values()) {
                cts.handle.dispose();
            }
        }));
    }
    /** @inheritdoc */
    isSpecificallyEnabledFor(testId) {
        return this.running.size > 0 && this.running.hasKey(TestId.fromString(testId).path);
    }
    /** @inheritdoc */
    isEnabledForAParentOf(testId) {
        return !!this.running.root.value || (this.running.size > 0 && this.running.hasKeyOrParent(TestId.fromString(testId).path));
    }
    /** @inheritdoc */
    isEnabledForProfile({ profileId, controllerId }) {
        for (const node of this.running.values()) {
            if (node.profiles.get().some(p => p.profileId === profileId && p.controllerId === controllerId)) {
                return true;
            }
        }
        return false;
    }
    /** @inheritdoc */
    isEnabledForAChildOf(testId) {
        return !!this.running.root.value || (this.running.size > 0 && this.running.hasKeyOrChildren(TestId.fromString(testId).path));
    }
    /** @inheritdoc */
    isEnabled() {
        return !!this.running.root.value || this.running.size > 0;
    }
    /** @inheritdoc */
    start(profiles, testId) {
        const store = new DisposableStore();
        let actualProfiles;
        if (profiles instanceof Array) {
            actualProfiles = observableValue('crProfiles', profiles);
        }
        else {
            // restart the continuous run when default profiles change, if we were
            // asked to run for a group
            const getRelevant = () => this.testProfileService.getGroupDefaultProfiles(profiles)
                .filter(p => p.supportsContinuousRun && (!testId || TestId.root(testId) === p.controllerId));
            actualProfiles = observableValue('crProfiles', getRelevant());
            store.add(this.testProfileService.onDidChange(() => {
                if (ref.autoSetDefault) {
                    const newRelevant = getRelevant();
                    if (!arrays.equals(newRelevant, actualProfiles.get())) {
                        actualProfiles.set(getRelevant(), undefined);
                    }
                }
            }));
        }
        const path = testId ? TestId.fromString(testId).path : [];
        const ref = { profiles: actualProfiles, handle: store, path, autoSetDefault: typeof profiles === 'number' };
        // If we're already running this specific test, then add the profile and turn
        // off the auto-addition of bitset-based profiles.
        const existing = this.running.find(path);
        if (existing) {
            store.dispose();
            ref.autoSetDefault = existing.autoSetDefault = false;
            existing.profiles.set([...new Set([...actualProfiles.get(), ...existing.profiles.get()])], undefined);
            this.changeEmitter.fire(testId);
            return;
        }
        this.running.insert(path, ref);
        const cancellationStores = new DisposableMap();
        store.add(toDisposable(() => {
            for (const cts of cancellationStores.values()) {
                cts.cancel();
            }
            cancellationStores.dispose();
        }));
        store.add(autorunIterableDelta(reader => actualProfiles.read(reader), ({ addedValues, removedValues }) => {
            for (const profile of addedValues) {
                const cts = new CancellationTokenSource();
                this.testService.startContinuousRun({
                    continuous: true,
                    group: profile.group,
                    targets: [{
                            testIds: [testId ?? profile.controllerId],
                            controllerId: profile.controllerId,
                            profileId: profile.profileId
                        }],
                }, cts.token);
                cancellationStores.set(profile, cts);
            }
            for (const profile of removedValues) {
                cancellationStores.get(profile)?.cancel();
                cancellationStores.deleteAndDispose(profile);
            }
            this.lastRun.store(new Set([...cancellationStores.keys()].map(p => p.profileId)));
        }));
        this.changeEmitter.fire(testId);
    }
    /** Stops a continuous run for the profile across all test items that are running it. */
    stopProfile({ profileId, controllerId }) {
        const toDelete = [];
        for (const node of this.running.values()) {
            const profs = node.profiles.get();
            const filtered = profs.filter(p => p.profileId !== profileId || p.controllerId !== controllerId);
            if (filtered.length === profs.length) {
                continue;
            }
            else if (filtered.length === 0) {
                toDelete.push(node);
            }
            else {
                node.profiles.set(filtered, undefined);
            }
        }
        for (let i = toDelete.length - 1; i >= 0; i--) {
            toDelete[i].handle.dispose();
            this.running.delete(toDelete[i].path);
        }
        this.changeEmitter.fire(undefined);
    }
    /** @inheritdoc */
    stop(testId) {
        const cancellations = [...this.running.deleteRecursive(testId ? TestId.fromString(testId).path : [])];
        // deleteRecursive returns a BFS order, reverse it so children are cancelled before parents
        for (let i = cancellations.length - 1; i >= 0; i--) {
            cancellations[i].handle.dispose();
        }
        this.changeEmitter.fire(testId);
    }
};
TestingContinuousRunService = __decorate([
    __param(0, ITestService),
    __param(1, IStorageService),
    __param(2, IContextKeyService),
    __param(3, ITestProfileService)
], TestingContinuousRunService);
export { TestingContinuousRunService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sbUNBQW1DLENBQUM7QUFDNUQsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoSCxPQUFPLEVBQUUsb0JBQW9CLEVBQXVCLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ25ILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUMvQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQ3JDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzdELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzlELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUdoRCxNQUFNLENBQUMs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