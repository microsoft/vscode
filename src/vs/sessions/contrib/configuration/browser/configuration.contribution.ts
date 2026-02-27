/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerDefaultConfigurations([{
	overrides: {
		'chat.agentsControl.enabled': true,
		'chat.agent.maxRequests': 1000,
		'chat.customizationsMenu.userStoragePath': '~/.copilot',
		'chat.restoreLastPanelSession': true,
		'chat.unifiedAgentsBar.enabled': true,
		'chat.viewSessions.enabled': false,

		'breadcrumbs.enabled': false,

		'diffEditor.renderSideBySide': false,
		'diffEditor.hideUnchangedRegions.enabled': true,

		'extensions.ignoreRecommendations': true,

		'files.autoSave': 'afterDelay',

		'git.autofetch': true,
		'git.detectWorktrees': false,
		'git.showProgress': false,

		'github.copilot.chat.claudeCode.enabled': true,
		'github.copilot.chat.cli.branchSupport.enabled': true,
		'github.copilot.chat.languageContext.typescript.enabled': true,
		'github.copilot.chat.cli.mcp.enabled': true,

		'inlineChat.affordance': 'editor',
		'inlineChat.renderMode': 'hover',

		'terminal.integrated.initialHint': false,

		'workbench.editor.restoreEditors': false,
		'workbench.editor.showTabs': 'single',
		'workbench.startupEditor': 'none',
		'workbench.tips.enabled': false,
		'workbench.layoutControl.type': 'toggles',
		'workbench.editor.useModal': 'all',
		'workbench.panel.showLabels': false,

		'window.menuStyle': 'custom',
		'window.dialogStyle': 'custom',
	},
	donotCache: true,
	preventExperimentOverride: true,
	source: 'sessionsDefaults'
}]);
