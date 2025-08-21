/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuntimeClientType } from '../../common/languageRuntimeClientInstance.js';
import { TestRuntimeClientInstance } from './testRuntimeClientInstance.js';

export class TestUiClientInstance extends TestRuntimeClientInstance {
	public workingDirectory: string = '';

	constructor(
		id: string
	) {
		super(id, RuntimeClientType.Ui);
	}

	setWorkingDirectory(workingDirectory: string): void {
		this.workingDirectory = workingDirectory;
		this.receiveData({
			data: {
				'jsonrpc': '2.0',
				'method': 'working_directory',
				'params': { directory: workingDirectory },
			}
		});
	}
}
