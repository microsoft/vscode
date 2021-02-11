/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { ISharedProcessService } from 'vs/platform/ipc/common/services';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IDiagnosticsService } from 'vs/platform/diagnostics/common/diagnostics';

// @ts-ignore: interface is implemented via proxy
export class DiagnosticsService implements IDiagnosticsService {

	declare readonly _serviceBrand: undefined;

	constructor(@ISharedProcessService sharedProcessService: ISharedProcessService) {
		return ProxyChannel.toService<IDiagnosticsService>(sharedProcessService.getChannel('diagnostics'));
	}
}

registerSingleton(IDiagnosticsService, DiagnosticsService, true);
