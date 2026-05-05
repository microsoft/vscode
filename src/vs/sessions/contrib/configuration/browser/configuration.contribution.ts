/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ThemeSettingDefaults } from '../../../../workbench/services/themes/common/workbenchThemeService.js';

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerDefaultConfigurations([{
	overrides: {
		'breadcrumbs.enabled': false,

		'chat.experimentalSessionsWindowOverride': true,
		'chat.hookFilesLocations': {
			'.claude/settings.local.json': false,
			'.claude/settings.json': false,
			'~/.claude/settings.json': false,
		},
		'chat.agent.maxRequests': 1000,
		'chat.customizationsMenu.userStoragePath': '~/.copilot',
		'chat.viewSessions.enabled': false,
		'chat.implicitContext.suggestedContext': false,
		'chat.implicitContext.enabled': { 'panel': 'never' },
		'chat.tools.terminal.enableAutoApprove': true,

		'diffEditor.hideUnchangedRegions.enabled': true,
		'diffEditor.renderGutterMenu': false,
		'diffEditor.renderIndicators': false,
		'diffEditor.renderMarginRevertIcon': false,
		'diffEditor.renderSideBySide': true,
		'diffEditor.useInlineViewWhenSpaceIsLimited': true,

		'extensions.ignoreRecommendations': true,

		'files.autoSave': 'afterDelay',

		'git.autofetch': true,
		'git.autorefresh': true,
		'git.branchRandomName.enable': true,
		'git.detectWorktrees': false,
		'git.showProgress': false,

		'github.copilot.enable': {
			'markdown': true,
			'plaintext': true,
		},
		'github.copilot.chat.claudeCode.enabled': true,
		'github.copilot.chat.cli.autoCommit.enabled': false,
		'github.copilot.chat.cli.branchSupport.enabled': true,
		'github.copilot.chat.cli.isolationOption.enabled': true,
		'github.copilot.chat.cli.sessionController.enabled': false,
		'github.copilot.chat.cli.lazyLoadSessionItem.enabled': false,
		'github.copilot.chat.cli.mcp.enabled': true,
		'github.copilot.chat.cli.remote.enabled': false,
		'github.copilot.chat.githubMcpServer.enabled': true,
		'github.copilot.chat.languageContext.typescript.enabled': true,
		'github.copilot.chat.cli.showExternalSessions': false,

		'inlineChat.affordance': 'editor',

		'search.quickOpen.includeHistory': false,

		'task.notifyWindowOnTaskCompletion': -1,

		'terminal.integrated.initialHint': false,

		'workbench.browser.openLocalhostLinks': true,
		'workbench.browser.enableChatTools': true,

		'workbench.editor.doubleClickTabToToggleEditorGroupSizes': 'maximize',
		'workbench.editor.restoreEditors': false,
		'update.showReleaseNotes': false,
		'workbench.notifications.position': 'bottom-right',
		'workbench.startupEditor': 'none',
		'workbench.tips.enabled': false,
		'workbench.layoutControl.type': 'toggles',
		'workbench.editor.useModal': 'all',
		'workbench.panel.showLabels': false,
		'workbench.colorTheme': ThemeSettingDefaults.COLOR_THEME_DARK,

		'window.menuStyle': 'custom',
		'window.dialogStyle': 'custom',
	},
	donotCache: true,
	preventExperimentOverride: true,
	source: 'sessionsDefaults'
}]);
