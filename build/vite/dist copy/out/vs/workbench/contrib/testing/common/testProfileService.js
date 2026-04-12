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
import { Emitter } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { deepClone } from '../../../../base/common/objects.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { StoredValue } from './storedValue.js';
import { TestId } from './testId.js';
import { testRunProfileBitsetList } from './testTypes.js';
import { TestingContextKeys } from './testingContextKeys.js';
export const ITestProfileService = createDecorator('testProfileService');
/**
 * Gets whether the given profile can be used to run the test.
 */
export const canUseProfileWithTest = (profile, test) => profile.controllerId === test.controllerId && (TestId.isRoot(test.item.extId) || !profile.tag || test.item.tags.includes(profile.tag));
const sorter = (a, b) => {
    if (a.isDefault !== b.isDefault) {
        return a.isDefault ? -1 : 1;
    }
    return a.label.localeCompare(b.label);
};
/**
 * Given a capabilities bitset, returns a map of context keys representing
 * them.
 */
export const capabilityContextKeys = (capabilities) => [
    [TestingContextKeys.hasRunnableTests.key, (capabilities & 2 /* TestRunProfileBitset.Run */) !== 0],
    [TestingContextKeys.hasDebuggableTests.key, (capabilities & 4 /* TestRunProfileBitset.Debug */) !== 0],
    [TestingContextKeys.hasCoverableTests.key, (capabilities & 8 /* TestRunProfileBitset.Coverage */) !== 0],
];
let TestProfileService = class TestProfileService extends Disposable {
    constructor(contextKeyService, storageService) {
        super();
        this.changeEmitter = this._register(new Emitter());
        this.controllerProfiles = new Map();
        /** @inheritdoc */
        this.onDidChange = this.changeEmitter.event;
        storageService.remove('testingPreferredProfiles', 1 /* StorageScope.WORKSPACE */); // cleanup old format
        this.userDefaults = this._register(new StoredValue({
            key: 'testingPreferredProfiles2',
            scope: 1 /* StorageScope.WORKSPACE */,
            target: 1 /* StorageTarget.MACHINE */,
        }, storageService));
        this.capabilitiesContexts = {
            [2 /* TestRunProfileBitset.Run */]: TestingContextKeys.hasRunnableTests.bindTo(contextKeyService),
            [4 /* TestRunProfileBitset.Debug */]: TestingContextKeys.hasDebuggableTests.bindTo(contextKeyService),
            [8 /* TestRunProfileBitset.Coverage */]: TestingContextKeys.hasCoverableTests.bindTo(contextKeyService),
            [16 /* TestRunProfileBitset.HasNonDefaultProfile */]: TestingContextKeys.hasNonDefaultProfile.bindTo(contextKeyService),
            [32 /* TestRunProfileBitset.HasConfigurable */]: TestingContextKeys.hasConfigurableProfile.bindTo(contextKeyService),
            [64 /* TestRunProfileBitset.SupportsContinuousRun */]: TestingContextKeys.supportsContinuousRun.bindTo(contextKeyService),
        };
        this.refreshContextKeys();
    }
    /** @inheritdoc */
    addProfile(controller, profile) {
        const previousExplicitDefaultValue = this.userDefaults.get()?.[controller.id]?.[profile.profileId];
        const extended = {
            ...profile,
            isDefault: previousExplicitDefaultValue ?? profile.isDefault,
            wasInitiallyDefault: profile.isDefault,
        };
        let record = this.controllerProfiles.get(profile.controllerId);
        if (record) {
            record.profiles.push(extended);
            record.profiles.sort(sorter);
        }
        else {
            record = {
                profiles: [extended],
                controller,
            };
            this.controllerProfiles.set(profile.controllerId, record);
        }
        this.refreshContextKeys();
        this.changeEmitter.fire();
    }
    /** @inheritdoc */
    updateProfile(controllerId, profileId, update) {
        const ctrl = this.controllerProfiles.get(controllerId);
        if (!ctrl) {
            return;
        }
        const profile = ctrl.profiles.find(c => c.controllerId === controllerId && c.profileId === profileId);
        if (!profile) {
            return;
        }
        Object.assign(profile, update);
        ctrl.profiles.sort(sorter);
        // store updates is isDefault as if the user changed it (which they might
        // have through some extension-contributed UI)
        if (update.isDefault !== undefined) {
            const map = deepClone(this.userDefaults.get({}));
            setIsDefault(map, profile, update.isDefault);
            this.userDefaults.store(map);
        }
        this.changeEmitter.fire();
    }
    /** @inheritdoc */
    configure(controllerId, profileId) {
        this.controllerProfiles.get(controllerId)?.controller.configureRunProfile(profileId);
    }
    /** @inheritdoc */
    removeProfile(controllerId, profileId) {
        const ctrl = this.controllerProfiles.get(controllerId);
        if (!ctrl) {
            return;
        }
        if (!profileId) {
            this.controllerProfiles.delete(controllerId);
            this.changeEmitter.fire();
            return;
        }
        const index = ctrl.profiles.findIndex(c => c.profileId === profileId);
        if (index === -1) {
            return;
        }
        ctrl.profiles.splice(index, 1);
        this.refreshContextKeys();
        this.changeEmitter.fire();
    }
    /** @inheritdoc */
    capabilitiesForTest(test) {
        const ctrl = this.controllerProfiles.get(TestId.root(test.extId));
        if (!ctrl) {
            return 0;
        }
        let capabilities = 0;
        for (const profile of ctrl.profiles) {
            if (!profile.tag || test.tags.includes(profile.tag)) {
                capabilities |= capabilities & profile.group ? 16 /* TestRunProfileBitset.HasNonDefaultProfile */ : profile.group;
            }
        }
        return capabilities;
    }
    /** @inheritdoc */
    all() {
        return this.controllerProfiles.values();
    }
    /** @inheritdoc */
    getControllerProfiles(profileId) {
        return this.controllerProfiles.get(profileId)?.profiles ?? [];
    }
    /** @inheritdoc */
    getGroupDefaultProfiles(group, controllerId) {
        const allProfiles = controllerId
            ? (this.controllerProfiles.get(controllerId)?.profiles || [])
            : [...Iterable.flatMap(this.controllerProfiles.values(), c => c.profiles)];
        const defaults = allProfiles.filter(c => c.group === group && c.isDefault);
        // have *some* default profile to run if none are set otherwise
        if (defaults.length === 0) {
            const first = allProfiles.find(p => p.group === group);
            if (first) {
                defaults.push(first);
            }
        }
        return defaults;
    }
    /** @inheritdoc */
    setGroupDefaultProfiles(group, profiles) {
        const next = {};
        for (const ctrl of this.controllerProfiles.values()) {
            next[ctrl.controller.id] = {};
            for (const profile of ctrl.profiles) {
                if (profile.group !== group) {
                    continue;
                }
                setIsDefault(next, profile, profiles.some(p => p.profileId === profile.profileId));
            }
            // When switching a profile, if the controller has a same-named profile in
            // other groups, update those to match the enablement state as well.
            for (const profile of ctrl.profiles) {
                if (profile.group === group) {
                    continue;
                }
                const matching = ctrl.profiles.find(p => p.group === group && p.label === profile.label);
                if (matching) {
                    setIsDefault(next, profile, matching.isDefault);
                }
            }
            ctrl.profiles.sort(sorter);
        }
        this.userDefaults.store(next);
        this.changeEmitter.fire();
    }
    getDefaultProfileForTest(group, test) {
        return this.getControllerProfiles(test.controllerId).find(p => (p.group & group) !== 0 && canUseProfileWithTest(p, test));
    }
    refreshContextKeys() {
        let allCapabilities = 0;
        for (const { profiles } of this.controllerProfiles.values()) {
            for (const profile of profiles) {
                allCapabilities |= allCapabilities & profile.group ? 16 /* TestRunProfileBitset.HasNonDefaultProfile */ : profile.group;
                allCapabilities |= profile.supportsContinuousRun ? 64 /* TestRunProfileBitset.SupportsContinuousRun */ : 0;
            }
        }
        for (const group of testRunProfileBitsetList) {
            this.capabilitiesContexts[group].set((allCapabilities & group) !== 0);
        }
    }
};
TestProfileService = __decorate([
    __param(0, IContextKeyService),
    __param(1, IStorageService)
], TestProfileService);
export { TestProfileService };
const setIsDefault = (map, profile, isDefault) => {
    profile.isDefault = isDefault;
    map[profile.controllerId] ??= {};
    if (profile.isDefault !== profile.wasInitiallyDefault) {
        map[profile.controllerId][profile.profileId] = profile.isDefault;
    }
    else {
        delete map[profile.controllerId][profile.profileId];
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFByb2ZpbGVTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdFByb2ZpbGVTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvRCxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDL0MsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUVyQyxPQUFPLEVBQXNFLHdCQUF3QixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDOUgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFN0QsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsZUFBZSxDQUFzQixvQkFBb0IsQ0FBQyxDQUFDO0FBbUU5Rjs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLENBQUMsT0FBd0IsRUFBRSxJQUFzQixFQUFFLEVBQUUsQ0FDekYsT0FBTyxDQUFDLFlBQVksS0FBSyxJQUFJLENBQUMsWUFBWSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0s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