/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { URI } from '../../../util/vs/base/common/uri';

export const needsWorkspaceFolderForTaskError = () => l10n.t`The model asked to run a build task, which requires a workspace folder. Please open a folder and retry.`;

export interface ILaunchConfigService {
	_serviceBrand: undefined;

	/**
	 * Adds the launch configuration and/or inputs to the user's launch.json.
	 */
	add(workspaceFolder: URI | undefined, config: ILaunchJSON): Promise<void>;

	/**
	 * Opens the user's launch.json. Optionally show the new configuration.
	 */
	show(workspaceFolder: URI, showConfigName?: string): Promise<void>;

	/**
	 * Launches the debug configuration.
	 */
	launch(config: ILaunchJSON | vscode.DebugConfiguration): Promise<void>;

	/**
	 * Resolves the configuration inputs in the given launch.json.
	 */
	resolveConfigurationInputs(launchJson: ILaunchJSON, defaults?: Map<string, string>, interactor?: ICommandInteractor): Promise<{ config: vscode.DebugConfiguration; inputs: Map<string, string> } | undefined>;
}

export const ILaunchConfigService = createServiceIdentifier<ILaunchConfigService>('ILaunchConfigService');

/** Describes the contents of launch.json */
export interface ILaunchJSON {
	configurations: vscode.DebugConfiguration[];
	inputs?: {
		type: string;
		id: string;
		description: string;
		options: string[];
	}[];
}

export interface ITasksJSON {
	tasks: vscode.TaskDefinition[];
}

export interface ICommandInteractor {
	isGenerating(): void;
	prompt(text: string, defaultValue?: string): Promise<string | undefined>;
	ensureTask(workspaceFolder: URI | undefined, definition: vscode.TaskDefinition): Promise<boolean>;
}
