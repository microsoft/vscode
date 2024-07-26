/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { TestService } from 'vs/workbench/contrib/testing/common/testServiceImpl';
import { ITestRunProfile, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testTypes';
import { Emitter, Event } from 'vs/base/common/event';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { WellDefinedPrefixTree } from 'vs/base/common/prefixTree';
import { ITestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import * as arrays from 'vs/base/common/arrays';

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
	onDidChange: Event<string | undefined>;

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
	 * Stops any continuous run
	 * Globally if no test is given, for a specific test otherwise.
	 */
	stop(testId?: string): void;
}

export class TestingContinuousRunService extends Disposable implements ITestingContinuousRunService {
	declare readonly _serviceBrand: undefined;

	private readonly changeEmitter = new Emitter<string | undefined>();
	private globallyRunning?: IDisposable;
	private readonly running = new WellDefinedPrefixTree<IDisposable>();
	private readonly lastRun: StoredValue<Set<number>>;
	private readonly isGloballyOn: IContextKey<boolean>;

	public readonly onDidChange = this.changeEmitter.event;

	public get lastRunProfileIds() {
		return this.lastRun.get(new Set());
	}

	constructor(
		@ITestService private readonly testService: TestService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITestProfileService private readonly testProfileService: ITestProfileService,
	) {
		super();
		this.isGloballyOn = TestingContextKeys.isContinuousModeOn.bindTo(contextKeyService);
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
			this.globallyRunning?.dispose();
			for (const cts of this.running.values()) {
				cts.dispose();
			}
		}));
	}

	/** @inheritdoc */
	public isSpecificallyEnabledFor(testId: string): boolean {
		return this.running.size > 0 && this.running.hasKey(TestId.fromString(testId).path);
	}

	/** @inheritdoc */
	public isEnabledForAParentOf(testId: string): boolean {
		if (this.globallyRunning) {
			return true;
		}

		return this.running.size > 0 && this.running.hasKeyOrParent(TestId.fromString(testId).path);
	}

	/** @inheritdoc */
	public isEnabledForAChildOf(testId: string): boolean {
		return this.running.size > 0 && this.running.hasKeyOrChildren(TestId.fromString(testId).path);
	}

	/** @inheritdoc */
	public isEnabled(): boolean {
		return !!this.globallyRunning || this.running.size > 0;
	}

	/** @inheritdoc */
	public start(profiles: ITestRunProfile[] | TestRunProfileBitset, testId?: string): void {
		const store = new DisposableStore();
		const cts = new CancellationTokenSource();
		store.add(toDisposable(() => cts.dispose(true)));

		if (testId === undefined) {
			this.isGloballyOn.set(true);
		}

		if (!testId) {
			this.globallyRunning?.dispose();
			this.globallyRunning = store;
		} else {
			this.running.mutate(TestId.fromString(testId).path, c => {
				c?.dispose();
				return store;
			});
		}

		let actualProfiles: ITestRunProfile[];
		if (profiles instanceof Array) {
			actualProfiles = profiles;
		} else {
			// restart the continuous run when default profiles change, if we were
			// asked to run for a group
			const getRelevant = () => this.testProfileService.getGroupDefaultProfiles(profiles)
				.filter(p => p.supportsContinuousRun && (!testId || TestId.root(testId) === p.controllerId));
			actualProfiles = getRelevant();
			store.add(this.testProfileService.onDidChange(() => {
				if (!arrays.equals(getRelevant(), actualProfiles)) {
					this.start(profiles, testId);
				}
			}));
		}

		this.lastRun.store(new Set(actualProfiles.map(p => p.profileId)));

		if (actualProfiles.length) {
			this.testService.startContinuousRun({
				continuous: true,
				group: actualProfiles[0].group,
				targets: actualProfiles.map(p => ({
					testIds: [testId ?? p.controllerId],
					controllerId: p.controllerId,
					profileId: p.profileId
				})),
			}, cts.token);
		}

		this.changeEmitter.fire(testId);
	}

	/** @inheritdoc */
	public stop(testId?: string): void {
		if (!testId) {
			this.globallyRunning?.dispose();
			this.globallyRunning = undefined;
		} else {
			const cancellations = [...this.running.deleteRecursive(TestId.fromString(testId).path)];
			// deleteRecursive returns a BFS order, reverse it so children are cancelled before parents
			for (let i = cancellations.length - 1; i >= 0; i--) {
				cancellations[i].dispose();
			}
		}

		if (testId === undefined) {
			this.isGloballyOn.set(false);
		}

		this.changeEmitter.fire(testId);
	}
}
