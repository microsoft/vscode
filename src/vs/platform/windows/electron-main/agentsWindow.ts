/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { BrowserWindow } from 'electron';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ChatAIDisabledSettingId } from '../../chat/common/chatSettings.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ConfigurationModelParser } from '../../configuration/common/configurationModels.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IOpenAgentsWindowOptions } from '../../native/common/native.js';
import { AgentsWindowOpenSource } from '../../window/common/window.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IOpenConfiguration, OpenContext } from './windows.js';

export async function checkAgentsWindowEnabled(configurationService: IConfigurationService, dialogMainService: IDialogMainService, logService: ILogService, fileService: IFileService, workspaceResource: URI, parentWindow?: BrowserWindow): Promise<boolean> {
	let disabled = configurationService.inspect<boolean>(ChatAIDisabledSettingId).policyValue;
	if (disabled === undefined) {
		disabled = configurationService.getValue<boolean>(ChatAIDisabledSettingId);
		try {
			const content = await fileService.readFile(workspaceResource);
			const parser = new ConfigurationModelParser(workspaceResource.toString(), logService);
			parser.parse(content.value.toString());
			const settings = parser.configurationModel.getValue<{ [ChatAIDisabledSettingId]?: boolean }>('settings');
			if (typeof settings?.[ChatAIDisabledSettingId] === 'boolean') {
				disabled = settings[ChatAIDisabledSettingId];
			}
		} catch (error) {
			if (!(error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND)) {
				logService.error('Failed to read Agents workspace configuration.', error);
				throw error;
			}
		}
	}
	if (disabled !== true) {
		return true;
	}

	logService.info('Agents Window launch blocked because AI features are disabled.');
	await dialogMainService.showMessageBox({
		type: 'info',
		message: localize('agentsWindow.aiDisabled', "AI features are disabled"),
		detail: localize('agentsWindow.aiDisabledDetail', "Open a VS Code editor window and enable AI features in Settings to use Agents. Your setting has not been changed."),
		buttons: [localize('agentsWindow.aiDisabledOK', "OK")],
		defaultId: 0,
		cancelId: 0,
		noLink: true,
	}, parentWindow);
	return false;
}

export function sendAgentsWindowOpenIntent(window: ICodeWindow, isExistingWindow: boolean, openConfig: IOpenConfiguration, options: IOpenAgentsWindowOptions): void {
	// A focus-only open must not navigate or cancel a pending reveal in an existing window.
	if (isExistingWindow && openConfig.context === OpenContext.API && options.reveal === undefined) {
		return;
	}

	const source = options.source ?? (openConfig.cli.agents ? AgentsWindowOpenSource.CommandLine : AgentsWindowOpenSource.Unknown);
	const draft = options.reveal === 'new' || openConfig.context === OpenContext.LINK ? options.draft : undefined;
	window.sendWhenReady('vscode:selectAgentsFolder', CancellationToken.None,
		URI.revive(options.folderUri)?.toJSON(),
		options.reveal === 'new' ? 'new' : URI.revive(options.reveal)?.toJSON(),
		source, options.folderUriIsDefault ?? false, draft,
		URI.revive(options.onboardingSessionResource)?.toJSON(),
		options.revealRemoteAuthority);
}

export async function resolveAgentsWindowFolder(openConfig: IOpenConfiguration, folderUri: URI | undefined, sessionResource: URI | undefined, source: AgentsWindowOpenSource | undefined, extractPaths: (cli: NativeParsedArgs) => Promise<readonly { readonly workspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier }[]>): Promise<URI | undefined> {
	if (folderUri || sessionResource || openConfig.context !== OpenContext.CLI || !openConfig.cli.agents || (source !== undefined && source !== AgentsWindowOpenSource.CommandLine)) {
		return folderUri;
	}

	const paths = await extractPaths(openConfig.cli);
	return paths.map(path => path.workspace).find(isSingleFolderWorkspaceIdentifier)?.uri;
}
