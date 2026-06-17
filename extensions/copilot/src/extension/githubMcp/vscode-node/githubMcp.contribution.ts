/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { lm } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { Disposable, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { GitHubMcpDefinitionProvider } from '../common/githubMcpDefinitionProvider';

export class GitHubMcpContrib extends Disposable {
	private disposable?: IDisposable;
	private definitionProvider?: GitHubMcpDefinitionProvider;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this._registerConfigurationListener();
		if (this.enabled) {
			void this._registerGitHubMcpDefinitionProvider();
		}
	}

	private _registerConfigurationListener() {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ConfigKey.GitHubMcpEnabled.fullyQualifiedId)) {
				if (this.enabled) {
					void this._registerGitHubMcpDefinitionProvider();
				} else {
					this.logService.trace('Unregistering GitHub MCP Definition Provider.');
					this.disposable?.dispose();
					this.disposable = undefined;
					this.definitionProvider = undefined;
				}
			}
		}));
	}

	private async _registerGitHubMcpDefinitionProvider() {
		if (!this.definitionProvider) {
			this.logService.trace('Registering GitHub MCP Definition Provider.');
			// Register the GitHub MCP Definition Provider
			this.definitionProvider = new GitHubMcpDefinitionProvider(this.configurationService, this.authenticationService, this.logService);
			this.disposable = lm.registerMcpServerDefinitionProvider('github', this.definitionProvider);
		}
	}

	private get enabled(): boolean {
		return this.configurationService.getExperimentBasedConfig(ConfigKey.GitHubMcpEnabled, this.experimentationService);
	}
}
