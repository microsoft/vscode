/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWebSocketFactory, IConnectCallback } from 'vs/platform/remote/common/remoteAgentConnection';

export const nodeWebSocketFactory = new class implements IWebSocketFactory {
	connect(host: string, port: number, query: string, callback: IConnectCallback): void {
		throw new Error(`Not implemented`);
	}
};
