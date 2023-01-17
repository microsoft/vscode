/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { TestService } from 'vs/workbench/contrib/testing/common/testServiceImpl';
import { ITestRunProfile } from 'vs/workbench/contrib/testing/common/testTypes';

export const ITestingContinuousRunService = createDecorator<ITestingContinuousRunService>('testingContinuousRunService');

export interface ITestingContinuousRunService {
	readonly _serviceBrand: undefined;

	/**
	 * Gets a list of the last test profiles that were continuously run in the workspace.
	 */
	readonly lastRunProfileIds: ReadonlySet<number>;

	/**
	 * Starts a continuous auto run with a specific profile or set of profiles.
	 */
	start(profile: ITestRunProfile[]): void;

	/**
	 * Stops any continuous run.
	 */
	stop(): void;
}

export class TestingContinuousRunService extends Disposable implements ITestingContinuousRunService {
	declare readonly _serviceBrand: undefined;

	private readonly lastRun: StoredValue<Set<number>>;
	private readonly cancellation = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly isOn: IContextKey<boolean>;

	public get lastRunProfileIds() {
		return this.lastRun.get(new Set());
	}

	constructor(
		@ITestService private readonly testService: TestService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.isOn = TestingContextKeys.isContinuousModeOn.bindTo(contextKeyService);
		this.lastRun = new StoredValue<Set<number>>({
			key: 'lastContinuousRunProfileIds',
			scope: StorageScope.WORKSPACE,
			target: StorageTarget.USER,
			serialization: {
				deserialize: v => new Set(JSON.parse(v)),
				serialize: v => JSON.stringify([...v])
			},
		}, storageService);
	}

	/** @inheritdoc */
	public start(profile: ITestRunProfile[]): void {
		this.cancellation.value?.cancel();
		const cts = this.cancellation.value = new CancellationTokenSource();

		this.isOn.set(true);
		this.lastRun.store(new Set(profile.map(p => p.profileId)));
		this.testService.startContinuousRun({
			continuous: true,
			targets: profile.map(p => ({
				testIds: [p.controllerId], // root id
				controllerId: p.controllerId,
				profileGroup: p.group,
				profileId: p.profileId
			})),
		}, cts.token);
	}

	stop(): void {
		this.isOn.set(false);
		this.cancellation.value?.cancel();
		this.cancellation.value = undefined;
	}
}
