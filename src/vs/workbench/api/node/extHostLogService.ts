/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService, DelegatedLogService, LogLevel } from 'vs/platform/log/common/log';
import { ExtHostLogServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtensionHostLogFileName } from 'vs/workbench/services/extensions/common/extensions';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { Schemas } from 'vs/base/common/network';
import { SpdLogService } from 'vs/platform/log/node/spdlogService';
import { dirname } from 'vs/base/common/resources';
import { IExtHostContribution, IExtHostContributionsRegistry, Extensions } from 'vs/workbench/api/common/extHostContributions';
import { IExtHostOutputService } from 'vs/workbench/api/common/extHostOutput';
import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Disposable } from 'vs/base/common/lifecycle';

export class ExtHostLogService extends DelegatedLogService implements ILogService, ExtHostLogServiceShape {

	constructor(
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IExtHostOutputService outputSerice: IExtHostOutputService,
	) {
		if (initData.logFile.scheme !== Schemas.file) { throw new Error('Only file-logging supported'); }
		super(new SpdLogService(ExtensionHostLogFileName, dirname(initData.logFile).fsPath, initData.logLevel));
		outputSerice.createOutputChannelFromLogFile(
			initData.remote.isRemote ? localize('remote extension host Log', "Remote Extension Host") : localize('extension host Log', "Extension Host"),
			initData.logFile);
	}

	$setLevel(level: LogLevel): void {
		this.setLevel(level);
	}
}

class ExtHostLogChannelContribution extends Disposable implements IExtHostContribution {

	constructor(
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IExtHostOutputService outputSerice: IExtHostOutputService,
	) {
		super();
		outputSerice.createOutputChannelFromLogFile(
			initData.remote.isRemote ? localize('remote extension host Log', "Remote Extension Host") : localize('extension host Log', "Extension Host"),
			initData.logFile);
	}

}

Registry.as<IExtHostContributionsRegistry>(Extensions.ExtHost).registerExtHostContribution(ExtHostLogChannelContribution);
