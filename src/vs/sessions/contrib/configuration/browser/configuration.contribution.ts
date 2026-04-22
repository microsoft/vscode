/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SessionsExperimentalSendButtonGradientSettingId, SessionsExperimentalShellGradientBackgroundSettingId } from '../../../common/configuration.js';
import { ThemeSettingDefaults } from '../../../../workbench/services/themes/common/workbenchThemeService.js';

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[SessionsExperimentalShellGradientBackgroundSettingId]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			description: localize('sessions.experimental.shellGradientBackground', "Whether to enable the experimental accent-tinted shell background in the Sessions window."),
		},
		[SessionsExperimentalSendButtonGradientSettingId]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			description: localize('sessions.experimental.sendButtonGradient', "Whether to show a colorful animated gradient on the chat send button in the Sessions window. The button shows a slowly rotating gradient ring at rest, fills with a cycling color on hover, and emits a color pulse on click."),
		},
	},
});

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
		'github.copilot.chat.cli.mcp.enabled': true,
		'github.copilot.chat.cli.remote.enabled': false,
		'github.copilot.chat.githubMcpServer.enabled': true,
		'github.copilot.chat.languageContext.typescript.enabled': true,

		'inlineChat.affordance': 'editor',
		'inlineChat.renderMode': 'hover',

		'search.quickOpen.includeHistory': false,

		'task.notifyWindowOnTaskCompletion': -1,

		'terminal.integrated.initialHint': false,

		'workbench.editor.doubleClickTabToToggleEditorGroupSizes': 'maximize',
		'workbench.editor.restoreEditors': false,
		'update.showReleaseNotes': false,
		'workbench.notifications.position': 'top-right',
		'workbench.startupEditor': 'none',
		'workbench.tips.enabled': false,
		'workbench.layoutControl.type': 'toggles',
		'workbench.editor.useModal': 'some',
		'workbench.panel.showLabels': false,
		'workbench.colorTheme': ThemeSettingDefaults.COLOR_THEME_DARK,

		'window.menuStyle': 'custom',
		'window.dialogStyle': 'custom',
	},
	donotCache: true,
	preventExperimentOverride: true,
	source: 'sessionsDefaults'
}]);
