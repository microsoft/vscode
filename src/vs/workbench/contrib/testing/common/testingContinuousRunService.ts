/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { TestService } from 'vs/workbench/contrib/testing/common/testServiceImpl';
import { ITestRunProfile } from 'vs/workbench/contrib/testing/common/testTypes';
import { Emitter, Event } from 'vs/base/common/event';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { WellDefinedPrefixTree } from 'vs/base/common/prefixTree';

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
	 * Starts a continuous auto run with a specific profile or set of profiles.
	 * Globally if no test is given, for a specific test otherwise.
	 */
	start(profile: ITestRunProfile[], testId?: string): void;

	/**
	 * Stops any continuous run
	 * Globally if no test is given, for a specific test otherwise.
	 */
	stop(testId?: string): void;
}

export class TestingContinuousRunService extends Disposable implements ITestingContinuousRunService {
	declare readonly _serviceBrand: undefined;

	private readonly changeEmitter = new Emitter<string | undefined>();
	private globallyRunning?: CancellationTokenSource;
	private readonly running = new WellDefinedPrefixTree<CancellationTokenSource>();
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
	public start(profile: ITestRunProfile[], testId?: string): void {
		const cts = new CancellationTokenSource();

		if (testId === undefined) {
			this.isGloballyOn.set(true);
		}

		if (!testId) {
			this.globallyRunning?.dispose(true);
			this.globallyRunning = cts;
		} else {
			this.running.mutate(TestId.fromString(testId).path, c => {
				c?.dispose(true);
				return cts;
			});
		}

		this.lastRun.store(new Set(profile.map(p => p.profileId)));

		this.testService.startContinuousRun({
			continuous: true,
			targets: profile.map(p => ({
				testIds: [testId ?? p.controllerId],
				controllerId: p.controllerId,
				profileGroup: p.group,
				profileId: p.profileId
			})),
		}, cts.token);

		this.changeEmitter.fire(testId);
	}

	/** @inheritdoc */
	public stop(testId?: string): void {
		if (!testId) {
			this.globallyRunning?.dispose(true);
			this.globallyRunning = undefined;
		} else {
			this.running.delete(TestId.fromString(testId).path)?.dispose(true);
		}

		if (testId === undefined) {
			this.isGloballyOn.set(false);
		}

		this.changeEmitter.fire(testId);
	}
}
