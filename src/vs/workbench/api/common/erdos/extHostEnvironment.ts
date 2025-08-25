/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { EnvironmentVariableAction } from 'erdos';
import * as extHostProtocol from './extHost.erdos.protocol.js';

export class ExtHostEnvironment implements extHostProtocol.ExtHostEnvironmentShape {

	private readonly _proxy: extHostProtocol.MainThreadEnvironmentShape;

	constructor(
		mainContext: extHostProtocol.IMainErdosContext
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainErdosContext.MainThreadEnvironment);
	}

	public async getEnvironmentContributions(): Promise<Record<string, EnvironmentVariableAction[]>> {
		const contributions = await this._proxy.$getEnvironmentContributions();
		return contributions;
	}
}