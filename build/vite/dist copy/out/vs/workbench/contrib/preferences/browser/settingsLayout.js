/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isWeb, isWindows } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
const COMMONLY_USED_SETTINGS = [
    'editor.fontSize',
    'editor.formatOnSave',
    'files.autoSave',
    'GitHub.copilot-chat.manageExtension',
    'editor.defaultFormatter',
    'editor.fontFamily',
    'editor.wordWrap',
    'chat.agent.maxRequests',
    'files.exclude',
    'workbench.colorTheme',
    'editor.tabSize',
    'editor.mouseWheelZoom',
    'editor.formatOnPaste'
];
export function getCommonlyUsedData(settingGroups) {
    const allSettings = new Map();
    for (const group of settingGroups) {
        for (const section of group.sections) {
            for (const s of section.settings) {
                allSettings.set(s.key, s);
            }
        }
    }
    const settings = [];
    for (const id of COMMONLY_USED_SETTINGS) {
        const setting = allSettings.get(id);
        if (setting) {
            settings.push(setting);
        }
    }
    return {
        id: 'commonlyUsed',
        label: localize('commonlyUsed', "Commonly Used"),
        settings
    };
}
export const tocData = {
    id: 'root',
    label: 'root',
    children: [
        {
            id: 'editor',
            label: localize('textEditor', "Text Editor"),
            settings: ['editor.*'],
            children: [
                {
                    id: 'editor/cursor',
                    label: localize('cursor', "Cursor"),
                    settings: ['editor.cursor*']
                },
                {
                    id: 'editor/find',
                    label: localize('find', "Find"),
                    settings: ['editor.find.*']
                },
                {
                    id: 'editor/font',
                    label: localize('font', "Font"),
                    settings: ['editor.font*']
                },
                {
                    id: 'editor/format',
                    label: localize('formatting', "Formatting"),
                    settings: ['editor.format*']
                },
                {
                    id: 'editor/diffEditor',
                    label: localize('diffEditor', "Diff Editor"),
                    settings: ['diffEditor.*']
                },
                {
                    id: 'editor/multiDiffEditor',
                    label: localize('multiDiffEditor', "Multi-File Diff Editor"),
                    settings: ['multiDiffEditor.*']
                },
                {
                    id: 'editor/minimap',
                    label: localize('minimap', "Minimap"),
                    settings: ['editor.minimap.*']
                },
                {
                    id: 'editor/suggestions',
                    label: localize('suggestions', "Suggestions"),
                    settings: ['editor.*suggest*']
                },
                {
                    id: 'editor/files',
                    label: localize('files', "Files"),
                    settings: ['files.*']
                }
            ]
        },
        {
            id: 'workbench',
            label: localize('workbench', "Workbench"),
            settings: ['workbench.*'],
            children: [
                {
                    id: 'workbench/appearance',
                    label: localize('appearance', "Appearance"),
                    settings: ['workbench.activityBar.*', 'workbench.*color*', 'workbench.fontAliasing', 'workbench.iconTheme', 'workbench.sidebar.location', 'workbench.*.visible', 'workbench.tips.enabled', 'workbench.tree.*', 'workbench.view.*']
                },
                {
                    id: 'workbench/breadcrumbs',
                    label: localize('breadcrumbs', "Breadcrumbs"),
                    settings: ['breadcrumbs.*']
                },
                {
                    id: 'workbench/editor',
                    label: localize('editorManagement', "Editor Management"),
                    settings: ['workbench.editor.*']
                },
                {
                    id: 'workbench/settings',
                    label: localize('settings', "Settings Editor"),
                    settings: ['workbench.settings.*']
                },
                {
                    id: 'workbench/zenmode',
                    label: localize('zenMode', "Zen Mode"),
                    settings: ['zenmode.*']
                },
                {
                    id: 'workbench/screencastmode',
                    label: localize('screencastMode', "Screencast Mode"),
                    settings: ['screencastMode.*']
                },
                {
                    id: 'workbench/browser',
                    label: localize('browser', "Browser"),
                    settings: ['workbench.browser.*']
                }
            ]
        },
        {
            id: 'window',
            label: localize('window', "Window"),
            settings: ['window.*'],
            children: [
                {
                    id: 'window/newWindow',
                    label: localize('newWindow', "New Window"),
                    settings: ['window.*newwindow*']
                }
            ]
        },
        {
            id: 'chat',
            label: localize('chat', "Chat"),
            children: [
                {
                    id: 'chat/agent',
                    label: localize('chatAgent', "Agent"),
                    settings: [
                        'chat.agent.*',
                        'chat.checkpoints.*',
                        'chat.editRequests',
                        'chat.requestQueuing.*',
                        'chat.undoRequests.*',
                        'chat.customAgentInSubagent.*',
                        'chat.editing.autoAcceptDelay',
                        'chat.editing.confirmEditRequest*',
                        'chat.planAgent.defaultModel'
                    ]
                },
                {
                    id: 'chat/appearance',
                    label: localize('chatAppearance', "Appearance"),
                    settings: [
                        'chat.editor.*',
                        'chat.fontFamily',
                        'chat.fontSize',
                        'chat.math.*',
                        'chat.agentsControl.*',
                        'chat.alternativeToolAction.*',
                        'chat.codeBlock.*',
                        'chat.editing.explainChanges.enabled',
                        'chat.editMode.hidden',
                        'chat.editorAssociations',
                        'chat.extensionUnification.*',
                        'chat.inlineReferences.*',
                        'chat.notifyWindow*',
                        'chat.statusWidget.*',
                        'chat.tips.*',
                        'chat.unifiedAgentsBar.*',
                        'accessibility.signals.chatUserActionRequired',
                        'accessibility.signals.chatResponseReceived'
                    ]
                },
                {
                    id: 'chat/sessions',
                    label: localize('chatSessions', "Sessions"),
                    settings: [
                        'chat.agentSessionProjection.*',
                        'chat.sessions.*',
                        'chat.viewProgressBadge.*',
                        'chat.viewSessions.*',
                        'chat.restoreLastPanelSession',
                        'chat.exitAfterDelegation',
                        'chat.repoInfo.*'
                    ]
                },
                {
                    id: 'chat/tools',
                    label: localize('chatTools', "Tools"),
                    settings: [
                        'chat.tools.*',
                        'chat.extensionTools.*'
                    ]
                },
                {
                    id: 'chat/mcp',
                    label: localize('chatMcp', "MCP"),
                    settings: ['mcp', 'chat.mcp.*', 'mcp.*']
                },
                {
                    id: 'chat/context',
                    label: localize('chatContext', "Context"),
                    settings: [
                        'chat.detectParticipant.*',
                        'chat.experimental.detectParticipant.*',
                        'chat.implicitContext.*',
                        'chat.promptFilesLocations',
                        'chat.instructionsFilesLocations',
                        'chat.modeFilesLocations',
                        'chat.agentFilesLocations',
                        'chat.agentSkillsLocations',
                        'chat.hookFilesLocations',
                        'chat.promptFilesRecommendations',
                        'chat.useAgentsMdFile',
                        'chat.useNestedAgentsMdFiles',
                        'chat.useAgentSkills',
                        'chat.experimental.useSkillAdherencePrompt',
                        'chat.useHooks',
                        'chat.includeApplyingInstructions',
                        'chat.includeReferencedInstructions',
                        'chat.sendElementsToChat.*',
                        'chat.useClaudeMdFile'
                    ]
                },
                {
                    id: 'chat/inlineChat',
                    label: localize('chatInlineChat', "Inline Chat"),
                    settings: ['inlineChat.*']
                },
                {
                    id: 'chat/miscellaneous',
                    label: localize('chatMiscellaneous', "Miscellaneous"),
                    settings: [
                        'chat.disableAIFeatures',
                        'chat.allowAnonymousAccess'
                    ]
                },
            ]
        },
        {
            id: 'features',
            label: localize('features', "Features"),
            children: [
                {
                    id: 'features/accessibilitySignals',
                    label: localize('accessibility.signals', 'Accessibility Signals'),
                    settings: ['accessibility.signal*']
                },
                {
                    id: 'features/accessibility',
                    label: localize('accessibility', "Accessibility"),
                    settings: ['accessibility.*']
                },
                {
                    id: 'features/explorer',
                    label: localize('fileExplorer', "Explorer"),
                    settings: ['explorer.*', 'outline.*']
                },
                {
                    id: 'features/search',
                    label: localize('search', "Search"),
                    settings: ['search.*']
                },
                {
                    id: 'features/debug',
                    label: localize('debug', "Debug"),
                    settings: ['debug.*', 'launch']
                },
                {
                    id: 'features/testing',
                    label: localize('testing', "Testing"),
                    settings: ['testing.*']
                },
                {
                    id: 'features/scm',
                    label: localize('scm', "Source Control"),
                    settings: ['scm.*']
                },
                {
                    id: 'features/extensions',
                    label: localize('extensions', "Extensions"),
                    settings: ['extensions.*']
                },
                {
                    id: 'features/terminal',
                    label: localize('terminal', "Terminal"),
                    settings: ['terminal.*']
                },
                {
                    id: 'features/task',
                    label: localize('task', "Task"),
                    settings: ['task.*']
                },
                {
                    id: 'features/problems',
                    label: localize('problems', "Problems"),
                    settings: ['problems.*']
                },
                {
                    id: 'features/output',
                    label: localize('output', "Output"),
                    settings: ['output.*']
                },
                {
                    id: 'features/comments',
                    label: localize('comments', "Comments"),
                    settings: ['comments.*']
                },
                {
                    id: 'features/remote',
                    label: localize('remote', "Remote"),
                    settings: ['remote.*']
                },
                {
                    id: 'features/timeline',
                    label: localize('timeline', "Timeline"),
                    settings: ['timeline.*']
                },
                {
                    id: 'features/notebook',
                    label: localize('notebook', 'Notebook'),
                    settings: ['notebook.*', 'interactiveWindow.*']
                },
                {
                    id: 'features/mergeEditor',
                    label: localize('mergeEditor', 'Merge Editor'),
                    settings: ['mergeEditor.*']
                },
                {
                    id: 'features/issueReporter',
                    label: localize('issueReporter', 'Issue Reporter'),
                    settings: ['issueReporter.*'],
                    hide: !isWeb
                }
            ]
        },
        {
            id: 'application',
            label: localize('application', "Application"),
            children: [
                {
                    id: 'application/http',
                    label: localize('proxy', "Proxy"),
                    settings: ['http.*']
                },
                {
                    id: 'application/keyboard',
                    label: localize('keyboard', "Keyboard"),
                    settings: ['keyboard.*']
                },
                {
                    id: 'application/update',
                    label: localize('update', "Update"),
                    settings: ['update.*']
                },
                {
                    id: 'application/telemetry',
                    label: localize('telemetry', "Telemetry"),
                    settings: ['telemetry.*']
                },
                {
                    id: 'application/settingsSync',
                    label: localize('settingsSync', "Settings Sync"),
                    settings: ['settingsSync.*']
                },
                {
                    id: 'application/network',
                    label: localize('network', "Network"),
                    settings: ['network.*']
                },
                {
                    id: 'application/experimental',
                    label: localize('experimental', "Experimental"),
                    settings: ['application.experimental.*']
                },
                {
                    id: 'application/other',
                    label: localize('other', "Other"),
                    settings: ['application.*'],
                    hide: isWindows
                }
            ]
        },
        {
            id: 'security',
            label: localize('security', "Security"),
            settings: ['security.*'],
            children: [
                {
                    id: 'security/workspace',
                    label: localize('workspace', "Workspace"),
                    settings: ['security.workspace.*']
                }
            ]
        }
    ]
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NMYXlvdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wcmVmZXJlbmNlcy9icm93c2VyL3NldHRpbmdzTGF5b3V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBdUI5QyxNQUFNLHNCQUFzQixHQUFzQjtJQUNqRCxpQkFBaUI7SUFDakIscUJBQXFCO0lBQ3JCLGdCQUFnQjtJQUNoQixxQ0FBcUM7SUFDckMseUJBQXlCO0lBQ3pCLG1CQUFtQjtJQUNuQixpQkFBaUI7SUFDakIsd0JBQXdCO0lBQ3hCLGVBQWU7SUFDZixzQkFBc0I7SUFDdEIsZ0JBQWdCO0lBQ2hCLHVCQUF1QjtJQUN2QixzQkFBc0I7Q0FDdEIsQ0FBQztBQUVGLE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxhQUErQjtJQUNsRSxNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsRUFBb0IsQ0FBQztJQUNoRCxLQUFLLE1BQU0sS0FBSyxJQUFJLGFBQWEsRUFBRSxDQUFDO1FBQ25DLEtBQUssTUFBTSxPQUFPLElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3RDLEtBQUssTUFBTSxDQUFDLElBQUksT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNsQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDM0IsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBQ0QsTUFBTSxRQUFRLEdBQWUsRUFBRSxDQUFDO0lBQ2hDLEtBQUssTUFBTSxFQUFFLElBQUksc0JBQXNCLEVBQUUsQ0FBQztRQUN6QyxNQUFNLE9B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