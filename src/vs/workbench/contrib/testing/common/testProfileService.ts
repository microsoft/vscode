/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { deepClone } from '../../../../base/common/objects.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { StoredValue } from './storedValue.js';
import { TestId } from './testId.js';
import { IMainThreadTestController } from './testService.js';
import { ITestItem, ITestRunProfile, InternalTestItem, TestRunProfileBitset, testRunProfileBitsetList } from './testTypes.js';
import { TestingContextKeys } from './testingContextKeys.js';

export const ITestProfileService = createDecorator<ITestProfileService>('testProfileService');

export interface ITestProfileService {
	readonly _serviceBrand: undefined;

	/**
	 * Fired when any profile changes.
	 */
	readonly onDidChange: Event<void>;

	/**
	 * Publishes a new test profile.
	 */
	addProfile(controller: IMainThreadTestController, profile: ITestRunProfile): void;

	/**
	 * Updates an existing test run profile
	 */
	updateProfile(controllerId: string, profileId: number, update: Partial<ITestRunProfile>): void;

	/**
	 * Removes a profile. If profileId is not given, all profiles
	 * for the given controller will be removed.
	 */
	removeProfile(controllerId: string, profileId?: number): void;

	/**
	 * Gets capabilities for the given test, indicating whether
	 * there's any usable profiles available for those groups.
	 * @returns a bitset to use with {@link TestRunProfileBitset}
	 */
	capabilitiesForTest(test: ITestItem): number;

	/**
	 * Configures a test profile.
	 */
	configure(controllerId: string, profileId: number): void;

	/**
	 * Gets all registered controllers, grouping by controller.
	 */
	all(): Iterable<Readonly<{
		controller: IMainThreadTestController;
		profiles: ITestRunProfile[];
	}>>;

	/**
	 * Gets the default profiles to be run for a given run group.
	 */
	getGroupDefaultProfiles(group: TestRunProfileBitset, controllerId?: string): ITestRunProfile[];

	/**
	 * Sets the default profiles to be run for a given run group.
	 */
	setGroupDefaultProfiles(group: TestRunProfileBitset, profiles: ITestRunProfile[]): void;

	/**
	 * Gets the profiles for a controller, in priority order.
	 */
	getControllerProfiles(controllerId: string): ITestRunProfile[];
}

/**
 * Gets whether the given profile can be used to run the test.
 */
export const canUseProfileWithTest = (profile: ITestRunProfile, test: InternalTestItem) =>
	profile.controllerId === test.controllerId && (TestId.isRoot(test.item.extId) || !profile.tag || test.item.tags.includes(profile.tag));

const sorter = (a: ITestRunProfile, b: ITestRunProfile) => {
	if (a.isDefault !== b.isDefault) {
		return a.isDefault ? -1 : 1;
	}

	return a.label.localeCompare(b.label);
};

interface IExtendedTestRunProfile extends ITestRunProfile {
	wasInitiallyDefault: boolean;
}

/**
 * Given a capabilities bitset, returns a map of context keys representing
 * them.
 */
export const capabilityContextKeys = (capabilities: number): [key: string, value: boolean][] => [
	[TestingContextKeys.hasRunnableTests.key, (capabilities & TestRunProfileBitset.Run) !== 0],
	[TestingContextKeys.hasDebuggableTests.key, (capabilities & TestRunProfileBitset.Debug) !== 0],
	[TestingContextKeys.hasCoverableTests.key, (capabilities & TestRunProfileBitset.Coverage) !== 0],
];

type DefaultsMap = { [controllerId: string]: { [profileId: number]: /* isDefault */ boolean } };

export class TestProfileService extends Disposable implements ITestProfileService {
	declare readonly _serviceBrand: undefined;
	private readonly userDefaults: StoredValue<DefaultsMap>;
	private readonly capabilitiesContexts: { [K in TestRunProfileBitset]: IContextKey<boolean> };
	private readonly changeEmitter = this._register(new Emitter<void>());
	private readonly controllerProfiles = new Map</* controller ID */string, {
		profiles: IExtendedTestRunProfile[];
		controller: IMainThreadTestController;
	}>();

	/** @inheritdoc */
	public readonly onDidChange = this.changeEmitter.event;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		storageService.remove('testingPreferredProfiles', StorageScope.WORKSPACE); // cleanup old format
		this.userDefaults = this._register(new StoredValue({
			key: 'testingPreferredProfiles2',
			scope: StorageScope.WORKSPACE,
			target: StorageTarget.MACHINE,
		}, storageService));

		this.capabilitiesContexts = {
			[TestRunProfileBitset.Run]: TestingContextKeys.hasRunnableTests.bindTo(contextKeyService),
			[TestRunProfileBitset.Debug]: TestingContextKeys.hasDebuggableTests.bindTo(contextKeyService),
			[TestRunProfileBitset.Coverage]: TestingContextKeys.hasCoverableTests.bindTo(contextKeyService),
			[TestRunProfileBitset.HasNonDefaultProfile]: TestingContextKeys.hasNonDefaultProfile.bindTo(contextKeyService),
			[TestRunProfileBitset.HasConfigurable]: TestingContextKeys.hasConfigurableProfile.bindTo(contextKeyService),
			[TestRunProfileBitset.SupportsContinuousRun]: TestingContextKeys.supportsContinuousRun.bindTo(contextKeyService),
		};

		this.refreshContextKeys();
	}

	/** @inheritdoc */
	public addProfile(controller: IMainThreadTestController, profile: ITestRunProfile): void {
		const previousExplicitDefaultValue = this.userDefaults.get()?.[controller.id]?.[profile.profileId];
		const extended: IExtendedTestRunProfile = {
			...profile,
			isDefault: previousExplicitDefaultValue ?? profile.isDefault,
			wasInitiallyDefault: profile.isDefault,
		};

		let record = this.controllerProfiles.get(profile.controllerId);
		if (record) {
			record.profiles.push(extended);
			record.profiles.sort(sorter);
		} else {
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
	public updateProfile(controllerId: string, profileId: number, update: Partial<ITestRunProfile>): void {
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
	public configure(controllerId: string, profileId: number) {
		this.controllerProfiles.get(controllerId)?.controller.configureRunProfile(profileId);
	}

	/** @inheritdoc */
	public removeProfile(controllerId: string, profileId?: number): void {
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
	public capabilitiesForTest(test: ITestItem) {
		const ctrl = this.controllerProfiles.get(TestId.root(test.extId));
		if (!ctrl) {
			return 0;
		}

		let capabilities = 0;
		for (const profile of ctrl.profiles) {
			if (!profile.tag || test.tags.includes(profile.tag)) {
				capabilities |= capabilities & profile.group ? TestRunProfileBitset.HasNonDefaultProfile : profile.group;
			}
		}

		return capabilities;
	}

	/** @inheritdoc */
	public all() {
		return this.controllerProfiles.values();
	}

	/** @inheritdoc */
	public getControllerProfiles(profileId: string) {
		return this.controllerProfiles.get(profileId)?.profiles ?? [];
	}

	/** @inheritdoc */
	public getGroupDefaultProfiles(group: TestRunProfileBitset, controllerId?: string) {
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
	public setGroupDefaultProfiles(group: TestRunProfileBitset, profiles: ITestRunProfile[]) {
		const next: DefaultsMap = {};
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

	private refreshContextKeys() {
		let allCapabilities = 0;
		for (const { profiles } of this.controllerProfiles.values()) {
			for (const profile of profiles) {
				allCapabilities |= allCapabilities & profile.group ? TestRunProfileBitset.HasNonDefaultProfile : profile.group;
				allCapabilities |= profile.supportsContinuousRun ? TestRunProfileBitset.SupportsContinuousRun : 0;
			}
		}

		for (const group of testRunProfileBitsetList) {
			this.capabilitiesContexts[group].set((allCapabilities & group) !== 0);
		}
	}
}

const setIsDefault = (map: DefaultsMap, profile: IExtendedTestRunProfile, isDefault: boolean) => {
	profile.isDefault = isDefault;
	map[profile.controllerId] ??= {};
	if (profile.isDefault !== profile.wasInitiallyDefault) {
		map[profile.controllerId][profile.profileId] = profile.isDefault;
	} else {
		delete map[profile.controllerId][profile.profileId];
	}
};
