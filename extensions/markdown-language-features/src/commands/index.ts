/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CommandManager } from '../commandManager';
import { MarkdownItEngine } from '../markdownEngine';
import { MarkdownPreviewManager } from '../preview/previewManager';
import { ContentSecurityPolicyArbiter, PreviewSecuritySelector } from '../preview/security';
import { TelemetryReporter } from '../telemetryReporter';
import { InsertLinkFromWorkspace, InsertImageFromWorkspace } from './insertResource';
import { RefreshPreviewCommand } from './refreshPreview';
import { ReloadPlugins } from './reloadPlugins';
import { RenderDocument } from './renderDocument';
import { ShowLockedPreviewToSideCommand, ShowPreviewCommand, ShowPreviewToSideCommand } from './showPreview';
import { ShowPreviewSecuritySelectorCommand } from './showPreviewSecuritySelector';
import { ShowSourceCommand } from './showSource';
import { ToggleLockCommand } from './toggleLock';

export function registerMarkdownCommands(
	commandManager: CommandManager,
	previewManager: MarkdownPreviewManager,
	telemetryReporter: TelemetryReporter,
	cspArbiter: ContentSecurityPolicyArbiter,
	engine: MarkdownItEngine,
): vscode.Disposable {
	const previewSecuritySelector = new PreviewSecuritySelector(cspArbiter, previewManager);

	commandManager.register(new ShowPreviewCommand(previewManager, telemetryReporter));
	commandManager.register(new ShowPreviewToSideCommand(previewManager, telemetryReporter));
	commandManager.register(new ShowLockedPreviewToSideCommand(previewManager, telemetryReporter));
	commandManager.register(new ShowSourceCommand(previewManager));
	commandManager.register(new RefreshPreviewCommand(previewManager, engine));
	commandManager.register(new ShowPreviewSecuritySelectorCommand(previewSecuritySelector, previewManager));
	commandManager.register(new ToggleLockCommand(previewManager));
	commandManager.register(new RenderDocument(engine));
	commandManager.register(new ReloadPlugins(previewManager, engine));
	commandManager.register(new InsertLinkFromWorkspace());
	commandManager.register(new InsertImageFromWorkspace());

	return commandManager;
}
