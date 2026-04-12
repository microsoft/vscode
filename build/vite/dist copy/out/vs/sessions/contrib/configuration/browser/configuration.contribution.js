/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ThemeSettingDefaults } from '../../../../workbench/services/themes/common/workbenchThemeService.js';
Registry.as(Extensions.Configuration).registerDefaultConfigurations([{
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
            'extensions.ignoreRecommendations': true,
            'files.autoSave': 'afterDelay',
            'git.autofetch': true,
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
            'github.copilot.chat.githubMcpServer.enabled': true,
            'github.copilot.chat.languageContext.typescript.enabled': true,
            'inlineChat.affordance': 'editor',
            'inlineChat.renderMode': 'hover',
            'search.quickOpen.includeHistory': false,
            'task.notifyWindowOnTaskCompletion': -1,
            'terminal.integrated.initialHint': false,
            'workbench.editor.doubleClickTabToToggleEditorGroupSizes': 'maximize',
            'workbench.editor.restoreEditors': false,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvbi5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2NvbmZpZ3VyYXRpb24vYnJvd3Nlci9jb25maWd1cmF0aW9uLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUEwQixNQUFNLG9FQUFvRSxDQUFDO0FBQ3hILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUU3RyxRQUFRLENBQUMsRUFBRSxDQUF5QixVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUM1RixTQUFTLEVBQUU7WUFDVixxQkFBcUIsRUFBRSxLQUFLO1lBRTVCLHlDQUF5QyxFQUFFLElBQUk7WUFDL0MseUJBQXlCLEVBQUU7Z0JBQzFCLDZCQUE2QixFQUFFLEtBQUs7Z0JBQ3BDLHVCQUF1QixFQUFFLEtBQUs7Z0JBQzlCLHlCQUF5QixFQUFFLEtBQUs7YUFDaEM7WUFDRCx3QkFBd0IsRUFBRSxJQUFJO1lBQzlCLHlDQUF5QyxFQUFFLFlBQVk7WUFDdkQsMkJBQTJCLEVBQUUsS0FBSztZQUNsQyx1Q0FBdUMsRUFBRSxLQUFLO1lBQzlDLDhCQUE4QixFQUFFLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRTtZQUNwRCx1Q0FBdUMsRUFBRSxJQUFJO1lBRTdDLHlDQUF5QyxFQUFFLElBQUk7WUFFL0Msa0NBQWtDLEVBQUUsSUFBSTtZQUV4QyxnQkFBZ0IsRUFBRSxZQUFZO1lBRTlCLGVBQWUsRUFBRSxJQUFJO1lBQ3JCLDZCQUE2QixFQUFFLElBQUk7WUFDbkMscUJBQXFCLEVBQUUsS0FBSztZQUM1QixrQkFBa0IsRUFBRSxLQUFLO1lBRXpCLHVCQUF1QixFQUFFO2dCQUN4QixVQUFVLEVBQUUsSUFBSTtnQkFDaEIsV0FBVyxFQUFFLElBQUk7YUFDakI7WUFDRCx3Q0FBd0MsRUFBRSxJQUFJO1lBQzlDLDRDQUE0QyxFQUFFLEtBQUs7WUFDbkQsK0NBQStDLEVBQUUsSUFBSTtZQUNyRCxpREFBaUQsRUFBRSxJQUFJO1lBQ3ZELHFDQUFxQyxFQUFFLElBQUk7WUFDM0MsNkNBQTZDLEVBQUUsSUFBSTtZQUNuRCx3REFBd0QsRUFBRSxJQUFJO1lBRTlELHVCQUF1QixFQUFFLFFBQVE7WUFDakMsdUJBQXVCLEVBQUUsT0FBTztZQUVoQyxpQ0FBaUMsRUFBRSxLQUFLO1lBRXhDLG1DQUFtQyxFQUFFLENBQUMsQ0FBQztZQUV2QyxpQ0FBaUMsRUFBRSxLQUFLO1lBRXhDLHlEQUF5RCxFQUFFLFVBQVU7WUFDckUsaUNBQWlDLEVBQUUsS0FBSztZQUN4Qyx5QkFBeUIsRUFBRSxNQUFNO1lBQ2pDLHdCQUF3QixFQUFFLEtBQUs7WUFDL0IsOEJBQThCLEVBQUUsU0FBUztZQUN6QywyQkFBMkIsRUFBRSxLQUFLO1lBQ2xDLDRCQUE0QixFQUFFLEtBQUs7WUFDbkMsc0JBQXNCLEVBQUUsb0JBQW9CLENBQUMsZ0JBQWdCO1lBRTdELGtCQUFrQixFQUFFLFFBQVE7WUFDNUIsb0JBQW9CLEVBQUUsUUFBUTtTQUM5QjtRQUNELFVBQVUsRUFBRSxJQUFJO1FBQ2hCLHlCQUF5QixFQUFFLElBQUk7UUFDL0IsTUFBTSxFQUFFLGtCQUFrQjtLQUMxQixDQUFDLENBQUMsQ0FBQyJ9