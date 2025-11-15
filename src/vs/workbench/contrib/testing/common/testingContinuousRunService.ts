/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from '../../../../base/common/arrays.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorunIterableDelta, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { WellDefinedPrefixTree } from '../../../../base/common/prefixTree.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { StoredValue } from './storedValue.js';
import { TestId } from './testId.js';
import { TestingContextKeys } from './testingContextKeys.js';
import { ITestProfileService } from './testProfileService.js';
import { ITestService } from './testService.js';
import { ITestRunProfile, TestRunProfileBitset } from './testTypes.js';

export const ITestingContinuousRunService = createDecorator<ITestingContinuousRunService>('testingContinuousRunService');

export interface ITestingContinuousRunService {
	readonly _serviceBrand: undefined;

	/**
	 * Gets a list of the last test profiles that were continuously run in the workspace.
	 */
	readonly lastRunProfileIds: ReadonlySet<number>;

	/**
	 * Fired when a test is added or removed from continous run, or when
	 * enablement is changed globally.
	 */
	readonly onDidChange: Event<string | undefined>;

	/**
	 * Gets whether continous run is specifically enabled for the given test ID.
	 */
	isSpecificallyEnabledFor(testId: string): boolean;

	/**
	 * Gets whether continous run is specifically enabled for
	 * the given test ID, or any of its parents.
	 */
	isEnabledForAParentOf(testId: string): boolean;

	/**
	 * Gets whether continous run is specifically enabled for
	 * the given test ID, or any of its parents.
	 */
	isEnabledForAChildOf(testId: string): boolean;

	/**
	 * Gets whether continuous run is turned on for the given profile.
	 */
	isEnabledForProfile(profile: ITestRunProfile): boolean;

	/**
	 * Gets whether it's enabled at all.
	 */
	isEnabled(): boolean;

	/**
	 * Starts a continuous auto run with a specific set of profiles, or all
	 * default profiles in a group. Globally if no test is given,
	 * for a specific test otherwise.
	 */
	start(profile: ITestRunProfile[] | TestRunProfileBitset, testId?: string): void;

	/**
	 * Stops a continuous run for the given test profile.
	 */
	stopProfile(profile: ITestRunProfile): void;

	/**
	 * Stops any continuous run
	 * Globally if no test is given, for a specific test otherwise.
	 */
	stop(testId?: string): void;
}

type RunningRef = { path: readonly string[]; profiles: ISettableObservable<ITestRunProfile[]>; autoSetDefault?: boolean; handle: DisposableStore };

export class TestingContinuousRunService extends Disposable implements ITestingContinuousRunService {
	declare readonly _serviceBrand: undefined;

	private readonly changeEmitter = new Emitter<string | undefined>();
	private readonly running = new WellDefinedPrefixTree<RunningRef>();
	private readonly lastRun: StoredValue<Set<number>>;

	public readonly onDidChange = this.changeEmitter.event;

	public get lastRunProfileIds() {
		return this.lastRun.get(new Set());
	}

	constructor(
		@ITestService private readonly testService: ITestService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITestProfileService private readonly testProfileService: ITestProfileService,
	) {
		super();
		const isGloballyOn = TestingContextKeys.isContinuousModeOn.bindTo(contextKeyService);
		this._register(this.onDidChange(() => {
			isGloballyOn.set(!!this.running.root.value);
		}));
		this.lastRun = this._register(new StoredValue<Set<number>>({
			key: 'lastContinuousRunProfileIds',
			scope: StorageScope.WORKSPACE,
			target: StorageTarget.MACHINE,
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
	public isSpecificallyEnabledFor(testId: string): boolean {
		return this.running.size > 0 && this.running.hasKey(TestId.fromString(testId).path);
	}

	/** @inheritdoc */
	public isEnabledForAParentOf(testId: string): boolean {
		return !!this.running.root.value || (this.running.size > 0 && this.running.hasKeyOrParent(TestId.fromString(testId).path));
	}

	/** @inheritdoc */
	public isEnabledForProfile({ profileId, controllerId }: ITestRunProfile): boolean {
		for (const node of this.running.values()) {
			if (node.profiles.get().some(p => p.profileId === profileId && p.controllerId === controllerId)) {
				return true;
			}
		}

		return false;
	}

	/** @inheritdoc */
	public isEnabledForAChildOf(testId: string): boolean {
		return !!this.running.root.value || (this.running.size > 0 && this.running.hasKeyOrChildren(TestId.fromString(testId).path));
	}

	/** @inheritdoc */
	public isEnabled(): boolean {
		return !!this.running.root.value || this.running.size > 0;
	}

	/** @inheritdoc */
	public start(profiles: ITestRunProfile[] | TestRunProfileBitset, testId?: string): void {
		const store = new DisposableStore();

		let actualProfiles: ISettableObservable<ITestRunProfile[]>;
		if (profiles instanceof Array) {
			actualProfiles = observableValue('crProfiles', profiles);
		} else {
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
		const ref: RunningRef = { profiles: actualProfiles, handle: store, path, autoSetDefault: typeof profiles === 'number' };

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

		const cancellationStores = new DisposableMap<ITestRunProfile, CancellationTokenSource>();
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
	stopProfile({ profileId, controllerId }: ITestRunProfile): void {
		const toDelete: RunningRef[] = [];
		for (const node of this.running.values()) {
			const profs = node.profiles.get();
			const filtered = profs.filter(p => p.profileId !== profileId || p.controllerId !== controllerId);
			if (filtered.length === profs.length) {
				continue;
			} else if (filtered.length === 0) {
				toDelete.push(node);
			} else {
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
	public stop(testId?: string): void {
		const cancellations = [...this.running.deleteRecursive(testId ? TestId.fromString(testId).path : [])];
		// deleteRecursive returns a BFS order, reverse it so children are cancelled before parents
		for (let i = cancellations.length - 1; i >= 0; i--) {
			cancellations[i].handle.dispose();
		}

		this.changeEmitter.fire(testId);
	}
}
