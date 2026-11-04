/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { homedir } from 'os';
import { IProcessEnvironment, platform } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { getCopilotHomePath } from '../../environment/common/copilotHome.js';
import { INativeMcpDiscoveryData, INativeMcpDiscoveryHelperService } from '../common/nativeMcpDiscoveryHelper.js';

export class NativeMcpDiscoveryHelperService implements INativeMcpDiscoveryHelperService {
	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly environment: IProcessEnvironment = process.env,
		private readonly resolveShellEnvironment?: () => Promise<IProcessEnvironment>,
	) { }

	async load(): Promise<INativeMcpDiscoveryData> {
		// Match the desktop Agent Host's shell overlay without changing other applications' discovery roots.
		const copilotEnvironment = this.resolveShellEnvironment ? { ...this.environment, ...await this.resolveShellEnvironment() } : this.environment;
		return {
			platform,
			homedir: URI.file(homedir()),
			copilotHome: URI.file(getCopilotHomePath(homedir(), copilotEnvironment)),
			winAppData: this.uriFromEnvVariable('APPDATA'),
			xdgHome: this.uriFromEnvVariable('XDG_CONFIG_HOME'),
		};
	}

	private uriFromEnvVariable(varName: string, environment = this.environment) {
		const envVar = environment[varName];
		if (!envVar) {
			return undefined;
		}
		return URI.file(envVar);
	}
}
