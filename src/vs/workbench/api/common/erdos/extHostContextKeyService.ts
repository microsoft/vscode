/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extHostProtocol from './extHost.erdos.protocol.js';

export class ExtHostContextKeyService implements extHostProtocol.ExtHostContextKeyServiceShape {

	private readonly _proxy: extHostProtocol.MainThreadContextKeyServiceShape;

	constructor(
		mainContext: extHostProtocol.IMainErdosContext,
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainErdosContext.MainThreadContextKeyService);
	}

	public evaluateWhenClause(whenClause: string): Promise<boolean> {
		return this._proxy.$evaluateWhenClause(whenClause);
	}

}