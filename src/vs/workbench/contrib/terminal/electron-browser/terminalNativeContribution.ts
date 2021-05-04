/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { linuxDistro } from 'vs/workbench/contrib/terminal/node/terminal';

export class TerminalNativeContribution extends Disposable implements IWorkbenchContribution {
	public _serviceBrand: undefined;

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IInstantiationService readonly instantiationService: IInstantiationService,
		@IRemoteAgentService readonly remoteAgentService: IRemoteAgentService,
		@INativeHostService readonly nativeHostService: INativeHostService
	) {
		super();

		this._terminalService.setLinuxDistro(linuxDistro);
	}
}
