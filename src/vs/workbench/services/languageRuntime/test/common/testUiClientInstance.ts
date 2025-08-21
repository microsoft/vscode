/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { URI } from '../../../../../base/common/uri.js';
import { UiClientInstance } from '../../common/languageRuntimeUiClient.js';
import { TestRuntimeClientInstance } from './testRuntimeClientInstance.js';

class TestOpenerService implements IOpenerService {
	declare readonly _serviceBrand: undefined;
	
	async open() {
		return false;
	}
	
	async resolveExternalUri(uri: URI) {
		return { resolved: uri, dispose: () => { } };
	}
	
	registerOpener() {
		return { dispose: () => { } };
	}
	
	registerValidator() {
		return { dispose: () => { } };
	}
	
	registerExternalUriResolver() {
		return { dispose: () => { } };
	}
	
	setDefaultExternalOpener() {
		// no-op
	}
	
	registerExternalOpener() {
		return { dispose: () => { } };
	}
}

class TestWorkbenchEnvironmentService {
	readonly remoteAuthority = undefined;
}

export class TestUiClientInstance extends Disposable {
	private readonly _uiClient: UiClientInstance;

	constructor(clientId: string = 'test-ui-client') {
		super();

		const runtimeClient = this._register(new TestRuntimeClientInstance(clientId));
		const logService = new NullLogService();
		const openerService = new TestOpenerService();
		const environmentService = new TestWorkbenchEnvironmentService() as any;

		this._uiClient = this._register(new UiClientInstance(
			runtimeClient,
			logService,
			openerService,
			environmentService
		));
	}

	get uiClient(): UiClientInstance {
		return this._uiClient;
	}
}
