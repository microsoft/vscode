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
import { ITestRunProfile, TestRunProfileBitset, testRunProfileBitsetList } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { IMainThreadTestController } from 'vs/workbench/contrib/testing/common/testService';

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
	 * Gets capabilities for the given controller by ID, indicating whether
	 * there's any profiles available for those groups.
	 * @returns a bitset to use with {@link TestRunProfileBitset}
	 */
	controllerCapabilities(controllerId: string): number;

	/**
	 * Configures a test profile.
	 */
	configure(controllerId: string, profileId: number): void;

	/**
	 * Gets all registered controllers, grouping by controller.
	 */
	all(): Iterable<Readonly<{
		capabilities: number,
		controller: IMainThreadTestController,
		profiles: ITestRunProfile[],
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
	getControllerProfiles(controllerId: string): undefined | {
		controller: IMainThreadTestController;
		profiles: ITestRunProfile[];
	};

	/**
	 * Gets the profiles for the group in a controller, in priorty order.
	 */
	getControllerGroupProfiles(controllerId: string, group: TestRunProfileBitset): readonly ITestRunProfile[];
}

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


export class TestProfileService implements ITestProfileService {
	declare readonly _serviceBrand: undefined;
	private readonly preferredDefaults: StoredValue<{ [K in TestRunProfileBitset]?: { controllerId: string; profileId: number }[] }>;
	private readonly capabilitiesContexts: { [K in TestRunProfileBitset]: IContextKey<boolean> };
	private readonly changeEmitter = new Emitter<void>();
	private readonly controllerProfiles = new Map</* controller ID */string, {
		profiles: ITestRunProfile[],
		controller: IMainThreadTestController,
		capabilities: number,
	}>();

	/** @inheritdoc */
	public readonly onDidChange = this.changeEmitter.event;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService storageService: IStorageService,
	) {
		this.preferredDefaults = new StoredValue({
			key: 'testingPreferredProfiles',
			scope: StorageScope.WORKSPACE,
			target: StorageTarget.USER,
		}, storageService);

		this.capabilitiesContexts = {
			[TestRunProfileBitset.Run]: TestingContextKeys.hasRunnableTests.bindTo(contextKeyService),
			[TestRunProfileBitset.Debug]: TestingContextKeys.hasDebuggableTests.bindTo(contextKeyService),
			[TestRunProfileBitset.Coverage]: TestingContextKeys.hasCoverableTests.bindTo(contextKeyService),
			[TestRunProfileBitset.HasNonDefaultProfile]: TestingContextKeys.hasNonDefaultProfile.bindTo(contextKeyService),
			[TestRunProfileBitset.HasConfigurable]: TestingContextKeys.hasConfigurableProfile.bindTo(contextKeyService),
		};

		this.refreshContextKeys();
	}

	/** @inheritdoc */
	public addProfile(controller: IMainThreadTestController, profile: ITestRunProfile): void {
		let record = this.controllerProfiles.get(profile.controllerId);
		if (record) {
			record.profiles.push(profile);
			record.profiles.sort(sorter);
			record.capabilities |= profile.group;
		} else {
			record = {
				profiles: [profile],
				controller,
				capabilities: profile.group
			};
			this.controllerProfiles.set(profile.controllerId, record);
		}

		if (!profile.isDefault) {
			record.capabilities |= TestRunProfileBitset.HasNonDefaultProfile;
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
		ctrl.capabilities = 0;
		for (const { group } of ctrl.profiles) {
			ctrl.capabilities |= group;
		}

		this.refreshContextKeys();
		this.changeEmitter.fire();
	}

	/** @inheritdoc */
	public controllerCapabilities(controllerId: string) {
		return this.controllerProfiles.get(controllerId)?.capabilities || 0;
	}

	/** @inheritdoc */
	public all() {
		return this.controllerProfiles.values();
	}

	/** @inheritdoc */
	public getControllerProfiles(profileId: string) {
		return this.controllerProfiles.get(profileId);
	}

	/** @inheritdoc */
	public getControllerGroupProfiles(controllerId: string, group: TestRunProfileBitset) {
		return this.controllerProfiles.get(controllerId)?.profiles.filter(c => c.group === group) ?? [];
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
		this.preferredDefaults.store({
			...this.preferredDefaults.get(),
			[group]: profiles.map(c => ({ profileId: c.profileId, controllerId: c.controllerId })),
		});

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
		for (const { capabilities } of this.controllerProfiles.values()) {
			allCapabilities |= capabilities;
		}

		for (const group of testRunProfileBitsetList) {
			this.capabilitiesContexts[group].set((allCapabilities & group) !== 0);
		}
	}
}
