/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as AgentSdk from '@anthropic-ai/claude-agent-sdk';
import type * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IClaudeAgentSdkLoaderService } from '../common/claudeAgentSdkLoaderService';
import { BundledClaudeAgentSdkLoaderService } from '../node/bundledClaudeAgentSdkLoaderService';
import { VsCodeClaudeAgentSdkLoaderService } from './claudeAgentSdkLoaderService';

/**
 * Routes SDK loading to either the bundled SDK or the ms-vscode.vscode-claude-sdk
 * extension, based on the `chat.claudeAgent.useSdkExtension` setting. The choice
 * is captured once at construction; flipping the setting takes effect on reload.
 */
export class RoutingClaudeAgentSdkLoaderService implements IClaudeAgentSdkLoaderService {
	readonly _serviceBrand: undefined;

	readonly inner: IClaudeAgentSdkLoaderService;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService experimentationService: IExperimentationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const useExtension = configurationService.getExperimentBasedConfig(ConfigKey.ClaudeAgentUseSdkExtension, experimentationService);
		this.inner = useExtension
			? instantiationService.createInstance(VsCodeClaudeAgentSdkLoaderService)
			: instantiationService.createInstance(BundledClaudeAgentSdkLoaderService);
	}

	get isAvailable(): boolean {
		return this.inner.isAvailable;
	}

	install(token: vscode.CancellationToken): Promise<boolean> {
		return this.inner.install(token);
	}

	load(): Promise<typeof AgentSdk> {
		return this.inner.load();
	}
}
