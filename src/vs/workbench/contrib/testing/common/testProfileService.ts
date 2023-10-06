/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { isDefined } from 'vs/base/common/types';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';
import { InternalTestItem, ITestRunProfile, TestRunProfileBitset, testRunProfileBitsetList } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { IMainThreadTestController } from 'vs/workbench/contrib/testing/common/testService';
import { Disposable } from 'vs/base/common/lifecycle';

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
	capabilitiesForTest(test: InternalTestItem): number;

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
	getGroupDefaultProfiles(group: TestRunProfileBitset): ITestRunProfile[];

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

/**
 * Given a capabilities bitset, returns a map of context keys representing
 * them.
 */
export const capabilityContextKeys = (capabilities: number): [key: string, value: boolean][] => [
	[TestingContextKeys.hasRunnableTests.key, (capabilities & TestRunProfileBitset.Run) !== 0],
	[TestingContextKeys.hasDebuggableTests.key, (capabilities & TestRunProfileBitset.Debug) !== 0],
	[TestingContextKeys.hasCoverableTests.key, (capabilities & TestRunProfileBitset.Coverage) !== 0],
];

export class TestProfileService extends Disposable implements ITestProfileService {
	declare readonly _serviceBrand: undefined;
	private readonly preferredDefaults: StoredValue<{ [K in TestRunProfileBitset]?: { controllerId: string; profileId: number }[] }>;
	private readonly capabilitiesContexts: { [K in TestRunProfileBitset]: IContextKey<boolean> };
	private readonly changeEmitter = this._register(new Emitter<void>());
	private readonly controllerProfiles = new Map</* controller ID */string, {
		profiles: ITestRunProfile[];
		controller: IMainThreadTestController;
	}>();

	/** @inheritdoc */
	public readonly onDidChange = this.changeEmitter.event;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		this.preferredDefaults = this._register(new StoredValue({
			key: 'testingPreferredProfiles',
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
		let record = this.controllerProfiles.get(profile.controllerId);
		if (record) {
			record.profiles.push(profile);
			record.profiles.sort(sorter);
		} else {
			record = {
				profiles: [profile],
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
	public capabilitiesForTest(test: InternalTestItem) {
		const ctrl = this.controllerProfiles.get(test.controllerId);
		if (!ctrl) {
			return 0;
		}

		let capabilities = 0;
		for (const profile of ctrl.profiles) {
			if (!profile.tag || test.item.tags.includes(profile.tag)) {
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
	public getGroupDefaultProfiles(group: TestRunProfileBitset) {
		const preferred = this.preferredDefaults.get();
		if (!preferred) {
			return this.getBaseDefaults(group);
		}

		const profiles = preferred[group]
			?.map(p => this.controllerProfiles.get(p.controllerId)?.profiles.find(
				c => c.profileId === p.profileId && c.group === group))
			.filter(isDefined);

		return profiles?.length ? profiles : this.getBaseDefaults(group);
	}

	/** @inheritdoc */
	public setGroupDefaultProfiles(group: TestRunProfileBitset, profiles: ITestRunProfile[]) {
		const next = {
			...this.preferredDefaults.get(),
			[group]: profiles.map(c => ({ profileId: c.profileId, controllerId: c.controllerId })),
		};

		// When switching a run/debug profile, if the controller has a same-named
		// profile in the other group, use that instead of anything else that was selected.
		if (group === TestRunProfileBitset.Run || group === TestRunProfileBitset.Debug) {
			const otherGroup = group === TestRunProfileBitset.Run ? TestRunProfileBitset.Debug : TestRunProfileBitset.Run;

			const previousDefaults = next[otherGroup] || [];
			let newDefaults = previousDefaults.slice();
			for (const [ctrlId, { profiles: ctrlProfiles }] of this.controllerProfiles) {
				const labels = new Set(profiles.filter(p => p.controllerId === ctrlId).map(p => p.label));
				const nextByLabels = ctrlProfiles.filter(p => labels.has(p.label) && p.group === otherGroup);
				if (nextByLabels.length) {
					newDefaults = newDefaults.filter(p => p.controllerId !== ctrlId);
					newDefaults.push(...nextByLabels.map(p => ({ profileId: p.profileId, controllerId: p.controllerId })));
				}
			}

			next[otherGroup] = newDefaults;
		}

		this.preferredDefaults.store(next);
		this.changeEmitter.fire();
	}

	private getBaseDefaults(group: TestRunProfileBitset) {
		const defaults: ITestRunProfile[] = [];
		for (const { profiles } of this.controllerProfiles.values()) {
			const profile = profiles.find(c => c.group === group);
			if (profile) {
				defaults.push(profile);
			}
		}

		return defaults;
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
