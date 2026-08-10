/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IExtensionsService } from '../../../platform/extensions/common/extensionsService';
import { IPackageJson } from '../../../platform/extensions/common/packageJson';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { equals } from '../../../util/vs/base/common/arrays';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { URI, UriComponents } from '../../../util/vs/base/common/uri';
import { ICommandInteractor, ILaunchConfigService } from '../common/launchConfigService';
import { IDebugCommandToConfigConverter } from './commandToConfigConverter';
import { IStartOptions, StartResult, StartResultKind } from './copilotDebugWorker/shared';
import { IStartDebuggingParsedResponse } from './parseLaunchConfigFromResponse';

const STORAGE_KEY = 'copilot-chat.terminalToDebugging.configs';
const LRU_SIZE = 30;

interface IStoredData {
	cwd: string;
	folder: UriComponents | undefined;
	args: readonly string[];
	inputs: [string, string][];
	config: IStartDebuggingParsedResponse;
}

// Just some random strings that will lead to defined return results if found in the arguments.
const testsStatuses: Record<string, StartResult> = {
	'73687c45-cancelled': {
		kind: StartResultKind.Cancelled,
	},
	'73687c45-extension': {
		kind: StartResultKind.NeedExtension,
		debugType: 'node',
	},
	'73687c45-noconfig': {
		kind: StartResultKind.NoConfig,
		text: 'No config generated',
	},
	'73687c45-ok': {
		kind: StartResultKind.Ok,
		folder: undefined,
		config: { type: 'node', name: 'Generated Node Launch', request: 'launch', program: '${workspaceFolder}/app.js' },
	}
};

export class CopilotDebugCommandSessionFactory {
	constructor(
		private readonly interactor: ICommandInteractor,
		@ITelemetryService private readonly telemetry: ITelemetryService,
		@IVSCodeExtensionContext private readonly context: IVSCodeExtensionContext,
		@IDebugCommandToConfigConverter private readonly commandToConfig: IDebugCommandToConfigConverter,
		@IExtensionsService private readonly extensionsService: IExtensionsService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@ILaunchConfigService private readonly launchConfigService: ILaunchConfigService,
	) { }

	public async start({ args, cwd, forceNew, printOnly, save }: IStartOptions, token: CancellationToken): Promise<StartResult> {
		/* __GDPR__
		"onboardDebug.commandExecuted" : {
			"owner": "connor4312",
			"comment": "Reports usages of the copilot-debug command",
			"binary": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Binary executed with the command" }
		}
		*/
		this.telemetry.sendMSFTTelemetryEvent('onboardDebug.commandExecuted', {
			binary: args[0],
		});

		for (const [key, prebaked] of Object.entries(testsStatuses)) {
			if (args.includes(key)) {
				return prebaked;
			}
		}

		let record = this.tryMatchExistingConfig(cwd, args);
		if (!record || forceNew) {
			this.interactor.isGenerating();
			const result = await this.commandToConfig.convert(cwd, args, token);
			if (!result.ok) {
				return { kind: StartResultKind.NoConfig, text: result.text };
			}

			record = {
				args,
				cwd,
				folder: result.workspaceFolder,
				inputs: [],
				config: result.config!,
			};

			/* __GDPR__
			"onboardDebug.sessionConfigGenerated" : {
				"owner": "connor4312",
				"comment": "Reports a generated config for the copilot-debug command",
				"binary": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Binary executed with the command" },
				"debugType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Debug type generated" }
			}
			*/
			this.telemetry.sendMSFTTelemetryEvent('onboardDebug.sessionConfigGenerated', {
				binary: args[0],
				debugType: record.config.configurations[0].type,
			});
		}

		const config = record.config.configurations[0];
		const folder = record.folder && this.workspaceService.getWorkspaceFolder(URI.revive(record.folder));
		if (!printOnly && record.config.tasks?.length) {
			if (!(await this.interactor.ensureTask(folder, record.config.tasks[0]))) {
				if (!save) { // if just saving, still let the user save even if they don't want the task
					return { kind: StartResultKind.Cancelled };
				}
			}
		}

		if (printOnly || save) {
			this.saveConfigInLRU(record);
			if (save) {
				await this.save(record.config, folder);
			}
			return { kind: StartResultKind.Ok, folder, config };
		}

		if (!this.hasMatchingExtension(config)) {
			return { kind: StartResultKind.NeedExtension, debugType: config.type };
		}

		const postInput = await this.launchConfigService.resolveConfigurationInputs(record.config, new Map(record.inputs), this.interactor);
		if (!postInput) {
			return { kind: StartResultKind.Cancelled };
		}

		// inputs are saved to use as defaults in the next run
		record.inputs = [...postInput.inputs];
		this.saveConfigInLRU(record);

		return {
			kind: StartResultKind.Ok,
			folder,
			config: postInput.config,
		};
	}

	private async save(launchConfig: { configurations: vscode.DebugConfiguration[]; inputs?: any[] }, folder: URI | undefined) {
		await this.launchConfigService.add(folder, launchConfig);
		if (folder) {
			await this.launchConfigService.show(folder, launchConfig.configurations[0].name);
		}
	}

	private hasMatchingExtension(config: vscode.DebugConfiguration) {
		for (const extension of this.extensionsService.allAcrossExtensionHosts) {
			const debuggers = (extension.packageJSON as IPackageJson)?.contributes?.debuggers;
			if (Array.isArray(debuggers) && debuggers.some(d => d && d.type === config.type)) {
				return true;
			}
		}

		return false;
	}

	private tryMatchExistingConfig(cwd: string, args: readonly string[]): IStoredData | undefined {
		const stored = this.readStoredConfigs();
		const exact = stored.findIndex(c => c.cwd === cwd && equals(c.args, args));
		if (exact !== -1) {
			return stored[exact];
		}

		// could possibly do more advanced things here like reusing an existing config if only one arg was different

		return undefined;
	}

	private readStoredConfigs(): readonly IStoredData[] {
		return this.context.workspaceState.get<IStoredData[]>(STORAGE_KEY, []);
	}

	private saveConfigInLRU(add: IStoredData) {
		const configs = this.readStoredConfigs().slice();
		const idx = configs.indexOf(add);
		if (idx >= 1) {
			configs.splice(idx, 1);
		}

		configs.unshift(add);
		while (configs.length > LRU_SIZE) {
			configs.pop();
		}

		this.context.workspaceState.update(STORAGE_KEY, configs);
	}
}
