/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
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
	private readonly running = new Map<string | undefined, CancellationTokenSource>();
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
		this.lastRun = new StoredValue<Set<number>>({
			key: 'lastContinuousRunProfileIds',
			scope: StorageScope.WORKSPACE,
			target: StorageTarget.MACHINE,
			serialization: {
				deserialize: v => new Set(JSON.parse(v)),
				serialize: v => JSON.stringify([...v])
			},
		}, storageService);
	}

	/** @inheritdoc */
	public isSpecificallyEnabledFor(testId: string): boolean {
		return this.running.has(testId);
	}

	/** @inheritdoc */
	public isEnabledForAParentOf(testId: string): boolean {
		if (!this.running.size) {
			return false;
		}

		if (this.running.has(undefined)) {
			return true;
		}

		for (const part of TestId.fromString(testId).idsFromRoot()) {
			if (this.running.has(part.toString())) {
				return true;
			}
		}

		return false;
	}

	/** @inheritdoc */
	public start(profile: ITestRunProfile[], testId?: string): void {
		const cts = new CancellationTokenSource();

		if (testId === undefined) {
			this.isGloballyOn.set(true);
		}

		this.running.get(testId)?.dispose(true);
		this.running.set(testId, cts);
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
		this.running.get(testId)?.dispose(true);
		this.running.delete(testId);

		if (testId === undefined) {
			this.isGloballyOn.set(false);
		}

		this.changeEmitter.fire(testId);
	}
}
