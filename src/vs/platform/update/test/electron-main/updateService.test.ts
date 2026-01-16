/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { IRequestService, AuthInfo, Credentials } from '../../../request/common/request.js';
import { IRequestContext } from '../../../../base/parts/request/common/request.js';
import { IUpdate, State, StateType, UpdateType } from '../../common/update.js';
import { AbstractUpdateService } from '../../electron-main/abstractUpdateService.js';
import { TestLifecycleMainService } from '../../../test/electron-main/workbenchTestServices.js';
import { IProductService } from '../../../product/common/productService.js';
import { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService, LifecycleMainPhase } from '../../../lifecycle/electron-main/lifecycleMainService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { newWriteableStream } from '../../../../base/common/stream.js';

// Test implementation of AbstractUpdateService
class TestableUpdateService extends AbstractUpdateService {
	private _doCheckForUpdatesHandler: ((explicit: boolean) => void) | undefined;
	public checkForUpdatesCallCount = 0;

	constructor(
		lifecycleMainService: ILifecycleMainService,
		configurationService: TestConfigurationService,
		environmentMainService: IEnvironmentMainService,
		requestService: IRequestService,
		productService: IProductService
	) {
		super(
			lifecycleMainService,
			configurationService,
			environmentMainService,
			requestService,
			new NullLogService(),
			productService
		);
	}

	protected buildUpdateFeedUrl(quality: string): string | undefined {
		return `https://update.code.visualstudio.com/api/update/test/${quality}/test-commit`;
	}

	protected doCheckForUpdates(explicit: boolean): void {
		this.checkForUpdatesCallCount++;
		if (this._doCheckForUpdatesHandler) {
			this._doCheckForUpdatesHandler(explicit);
		}
	}

	setDoCheckForUpdatesHandler(handler: (explicit: boolean) => void): void {
		this._doCheckForUpdatesHandler = handler;
	}

	// Expose protected method for testing
	public testSetState(state: State): void {
		this.setState(state);
	}

	// Expose url for testing
	public getUrl(): string | undefined {
		return this.url;
	}

	// Test helper to manually trigger initialization
	public async testInitialize(): Promise<void> {
		await this.initialize();
	}

	dispose(): void {
		// noop for tests
	}
}

// Mock environment service
class TestEnvironmentMainService implements Partial<IEnvironmentMainService> {
	isBuilt = true;
	disableUpdates = false;
}

// Mock request service that can return configurable responses
class TestRequestService implements IRequestService {
	readonly _serviceBrand: undefined;

	private _responseStatusCode = 200;
	private _responseBody: IUpdate | null = null;
	public requestCount = 0;

	setResponse(statusCode: number, body: IUpdate | null): void {
		this._responseStatusCode = statusCode;
		this._responseBody = body;
	}

	async request(options: { url: string }, token: CancellationToken): Promise<IRequestContext> {
		this.requestCount++;

		const stream = newWriteableStream<VSBuffer>(chunk => VSBuffer.concat(chunk));
		if (this._responseBody) {
			stream.end(VSBuffer.fromString(JSON.stringify(this._responseBody)));
		} else {
			stream.end();
		}

		return {
			res: {
				statusCode: this._responseStatusCode,
				headers: {}
			},
			stream
		};
	}

	async resolveProxy(url: string): Promise<string | undefined> {
		return undefined;
	}

	async lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined> {
		return undefined;
	}

	async lookupKerberosAuthorization(urlStr: string): Promise<string | undefined> {
		return undefined;
	}

	async loadCertificates(): Promise<string[]> {
		return [];
	}
}

// Mock product service
class TestProductService implements Partial<IProductService> {
	updateUrl = 'https://update.code.visualstudio.com';
	commit = 'test-commit';
	quality = 'insider';
	version = '1.0.0';
}

suite('AbstractUpdateService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let lifecycleMainService: TestLifecycleMainService;
	let configurationService: TestConfigurationService;
	let environmentMainService: TestEnvironmentMainService;
	let requestService: TestRequestService;
	let productService: TestProductService;

	setup(() => {
		lifecycleMainService = new TestLifecycleMainService();
		lifecycleMainService.phase = LifecycleMainPhase.Ready;
		configurationService = new TestConfigurationService({
			'update.mode': 'default'
		});
		environmentMainService = new TestEnvironmentMainService();
		requestService = new TestRequestService();
		productService = new TestProductService();
	});

	test('isLatestVersion returns true when server returns 204', async () => {
		const service = new TestableUpdateService(
			lifecycleMainService,
			configurationService,
			environmentMainService as IEnvironmentMainService,
			requestService,
			productService as IProductService
		);
		disposables.add(service);

		await service.testInitialize();

		// Server returns 204 (No Content) - means we're on the latest version
		requestService.setResponse(204, null);

		const result = await service.isLatestVersion();
		assert.strictEqual(result, true);
	});

	test('isLatestVersion returns false when server returns update info', async () => {
		const service = new TestableUpdateService(
			lifecycleMainService,
			configurationService,
			environmentMainService as IEnvironmentMainService,
			requestService,
			productService as IProductService
		);
		disposables.add(service);

		await service.testInitialize();

		// Server returns 200 with update info - means a newer version is available
		const update: IUpdate = {
			version: 'new-version',
			productVersion: '1.1.0',
			url: 'https://update.code.visualstudio.com/download'
		};
		requestService.setResponse(200, update);

		const result = await service.isLatestVersion();
		assert.strictEqual(result, false);
	});

	test('isLatestVersion returns false when update mode is none', async () => {
		configurationService = new TestConfigurationService({
			'update.mode': 'none'
		});

		const service = new TestableUpdateService(
			lifecycleMainService,
			configurationService,
			environmentMainService as IEnvironmentMainService,
			requestService,
			productService as IProductService
		);
		disposables.add(service);

		// When mode is 'none', isLatestVersion returns false per the code logic
		// (see isLatestVersion method: if mode === 'none' return false)
		const result = await service.isLatestVersion();
		assert.strictEqual(result, false);
	});

	test('checkForUpdates only triggers when in Idle state', async () => {
		const service = new TestableUpdateService(
			lifecycleMainService,
			configurationService,
			environmentMainService as IEnvironmentMainService,
			requestService,
			productService as IProductService
		);
		disposables.add(service);

		await service.testInitialize();

		// Set up handler to track calls
		let checkCalled = false;
		service.setDoCheckForUpdatesHandler(() => {
			checkCalled = true;
		});

		// When in Idle state, checkForUpdates should call doCheckForUpdates
		service.testSetState(State.Idle(UpdateType.Setup));
		await service.checkForUpdates(true);
		assert.strictEqual(checkCalled, true);

		// Reset
		checkCalled = false;

		// When not in Idle state, checkForUpdates should NOT call doCheckForUpdates
		service.testSetState(State.CheckingForUpdates(false));
		await service.checkForUpdates(true);
		assert.strictEqual(checkCalled, false);
	});

	test('state changes are emitted via onStateChange', async () => {
		const service = new TestableUpdateService(
			lifecycleMainService,
			configurationService,
			environmentMainService as IEnvironmentMainService,
			requestService,
			productService as IProductService
		);
		disposables.add(service);

		await service.testInitialize();

		const stateChanges: State[] = [];
		disposables.add(service.onStateChange((state: State) => stateChanges.push(state)));

		service.testSetState(State.CheckingForUpdates(true));
		service.testSetState(State.Idle(UpdateType.Setup));

		assert.strictEqual(stateChanges.length, 2);
		assert.strictEqual(stateChanges[0].type, StateType.CheckingForUpdates);
		assert.strictEqual(stateChanges[1].type, StateType.Idle);
	});
});
