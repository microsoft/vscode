/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IExtensionsService } from '../../../platform/extensions/common/extensionsService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isAbsolute, join, relative } from '../../../util/vs/base/common/path';
import { count } from '../../../util/vs/base/common/strings';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { StartDebuggingPrompt, StartDebuggingType } from '../../prompts/node/panel/startDebugging';
import { IStartDebuggingParsedResponse, parseLaunchConfigFromResponse } from './parseLaunchConfigFromResponse';

export interface IDebugConfigResult {
	ok: boolean;
	workspaceFolder: URI | undefined;
	config: IStartDebuggingParsedResponse | undefined;
	text: string;
}

export interface IDebugCommandToConfigConverter {
	readonly _serviceBrand: undefined;
	convert(cwd: string, args: readonly string[], token: CancellationToken): Promise<IDebugConfigResult>;
}

export const IDebugCommandToConfigConverter = createServiceIdentifier<IDebugCommandToConfigConverter>('IDebugCommandToConfigConverter');

export class DebugCommandToConfigConverter implements IDebugCommandToConfigConverter {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceService private readonly workspace: IWorkspaceService,
		@ITelemetryService private readonly telemetry: ITelemetryService,
		@IExtensionsService private readonly extensionsService: IExtensionsService,
	) {
	}

	/**
	 * Converts a command run in the given working directory to a VS Code
	 * launch config.
	 */
	public async convert(cwd: string, args: readonly string[], token: CancellationToken): Promise<IDebugConfigResult> {
		const relCwd = getPathRelativeToWorkspaceFolder(cwd, this.workspace);

		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-base');
		const promptRenderer = PromptRenderer.create(
			this.instantiationService,
			endpoint,
			StartDebuggingPrompt,
			{
				input: {
					type: StartDebuggingType.CommandLine,
					relativeCwd: relCwd?.path,
					absoluteCwd: cwd,
					args,
				},
				history: [],
			}
		);

		const prompt = await promptRenderer.render(undefined, token);
		const fetchResult = await endpoint.makeChatRequest(
			'debugCommandToConfig',
			prompt.messages,
			undefined,
			token,
			ChatLocation.Other,
		);

		if (fetchResult.type !== ChatFetchResponseType.Success) {
			return { ok: false, config: undefined, text: fetchResult.reason, workspaceFolder: relCwd?.folder };
		}

		const config = parseLaunchConfigFromResponse(fetchResult.value, this.extensionsService);

		/* __GDPR__
		"onboardDebug.configGenerated" : {
			"owner": "connor4312",
			"comment": "Reports usages of the copilot-debug command",
			"configGenerated": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether a config was generated", "isMeasurement": true },
			"configType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "command": "launch.json config type generated, if any" }
		}
		*/
		this.telemetry.sendMSFTTelemetryEvent('onboardDebug.configGenerated', {
			configType: config?.configurations[0].type,
		}, {
			ok: config ? 1 : 0,
		});

		return {
			ok: true,
			config,
			text: fetchResult.value,
			workspaceFolder: relCwd?.folder
		};
	}
}

export function getPathRelativeToWorkspaceFolder(path: string, workspace: IWorkspaceService) {
	let closest: { rel: string; distance: number; folder: URI } | undefined;

	for (const folder of workspace.getWorkspaceFolders()) {
		const rel = relative(folder.fsPath, path);
		const distance = isAbsolute(rel) ? Infinity : count(rel, '..');
		if (!closest || distance < closest.distance || (distance === closest.distance && rel.length < closest.rel.length)) {
			closest = { rel: join('${workspaceFolder}', rel).replaceAll('\\', '/'), distance, folder };
		}
	}

	return closest && { folder: closest.folder, path: closest.rel };
}
