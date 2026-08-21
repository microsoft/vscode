/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getTsNativeExtension, tsNativeExtensionOldId } from '../commands/useTsgo';
import { ExperimentationService } from '../experimentationService';
import { PluginManager } from '../tsServer/plugins';
import { copilotChatExtensionId } from '../typescriptServiceClient';

const suggestNativePreviewStorageKey = 'typescript.suggestNativePreview.dismissed';

export async function suggestNativePreview(
	context: vscode.ExtensionContext,
	experimentationService: ExperimentationService,
	pluginManager: PluginManager,
): Promise<void> {
	if (context.globalState.get<boolean>(suggestNativePreviewStorageKey)) {
		return;
	}

	// Only show when the window is active
	if (!vscode.window.state.active) {
		return;
	}

	// TSServer plugins are not supported by TypeScript 7
	if (pluginManager.plugins.some(plugin => plugin.extension.id.toLowerCase() !== copilotChatExtensionId)) {
		return;
	}

	// Don't show if the native preview extension is already installed
	if (getTsNativeExtension()) {
		// Also don't prompt in the future
		await context.globalState.update(suggestNativePreviewStorageKey, true);
		return;
	}

	const inExperiment = await experimentationService.getTreatmentVariable('suggestTS7IfNoPlugins', false);
	if (!inExperiment) {
		return;
	}

	const install: vscode.MessageItem = { title: vscode.l10n.t("Install") };
	const learnMore: vscode.MessageItem = { title: vscode.l10n.t("Learn More") };
	const dismiss: vscode.MessageItem = { title: vscode.l10n.t("Don't Show Again") };

	const selection = await vscode.window.showInformationMessage(
		vscode.l10n.t("Try TypeScript 7 Native Preview for significantly faster type checking and language features."),
		{},
		install,
		learnMore,
		dismiss,
	);
	// Don't show again
	await context.globalState.update(suggestNativePreviewStorageKey, true);

	if (selection === install) {
		await vscode.commands.executeCommand('workbench.extensions.installExtension', tsNativeExtensionOldId);
	} else if (selection === learnMore) {
		await vscode.env.openExternal(vscode.Uri.parse('https://aka.ms/vscode-try-ts-7-learn-more'));
	}
}
