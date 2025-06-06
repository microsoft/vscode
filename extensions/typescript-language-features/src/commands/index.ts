/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PluginManager } from '../tsServer/plugins';
import TypeScriptServiceClientHost from '../typeScriptServiceClientHost';
import { ActiveJsTsEditorTracker } from '../ui/activeJsTsEditorTracker';
import { Lazy } from '../utils/lazy';
import { CommandManager } from './commandManager';
import { ConfigurePluginCommand } from './configurePlugin';
import { EnableTsgoCommand, DisableTsgoCommand } from './useTsgo';
import { JavaScriptGoToProjectConfigCommand, TypeScriptGoToProjectConfigCommand } from './goToProjectConfiguration';
import { LearnMoreAboutRefactoringsCommand } from './learnMoreAboutRefactorings';
import { OpenJsDocLinkCommand } from './openJsDocLink';
import { OpenTsServerLogCommand } from './openTsServerLog';
import { ReloadJavaScriptProjectsCommand, ReloadTypeScriptProjectsCommand } from './reloadProject';
import { RestartTsServerCommand } from './restartTsServer';
import { SelectTypeScriptVersionCommand } from './selectTypeScriptVersion';
import { TSServerRequestCommand } from './tsserverRequests';

export function registerBaseCommands(
	commandManager: CommandManager,
	lazyClientHost: Lazy<TypeScriptServiceClientHost>,
	pluginManager: PluginManager,
	activeJsTsEditorTracker: ActiveJsTsEditorTracker,
): void {
	commandManager.register(new ReloadTypeScriptProjectsCommand(lazyClientHost));
	commandManager.register(new ReloadJavaScriptProjectsCommand(lazyClientHost));
	commandManager.register(new SelectTypeScriptVersionCommand(lazyClientHost));
	commandManager.register(new OpenTsServerLogCommand(lazyClientHost));
	commandManager.register(new RestartTsServerCommand(lazyClientHost));
	commandManager.register(new TypeScriptGoToProjectConfigCommand(activeJsTsEditorTracker, lazyClientHost));
	commandManager.register(new JavaScriptGoToProjectConfigCommand(activeJsTsEditorTracker, lazyClientHost));
	commandManager.register(new ConfigurePluginCommand(pluginManager));
	commandManager.register(new LearnMoreAboutRefactoringsCommand());
	commandManager.register(new TSServerRequestCommand(lazyClientHost));
	commandManager.register(new OpenJsDocLinkCommand());
	commandManager.register(new EnableTsgoCommand());
	commandManager.register(new DisableTsgoCommand());
}
