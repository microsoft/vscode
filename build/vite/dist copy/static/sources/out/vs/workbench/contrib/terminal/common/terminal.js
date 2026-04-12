/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isLinux } from '../../../../base/common/platform.js';
import * as nls from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { defaultTerminalContribCommandsToSkipShell } from '../terminalContribExports.js';
export const TERMINAL_VIEW_ID = 'terminal';
export const TERMINAL_CREATION_COMMANDS = ['workbench.action.terminal.toggleTerminal', 'workbench.action.terminal.new', 'workbench.action.togglePanel', 'workbench.action.terminal.focus'];
export const TERMINAL_CONFIG_SECTION = 'terminal.integrated';
export const DEFAULT_LETTER_SPACING = 0;
export const MINIMUM_LETTER_SPACING = -5;
// HACK: On Linux it's common for fonts to include an underline that is rendered lower than the
// bottom of the cell which causes it to be cut off due to `overflow:hidden` in the DOM renderer.
// See:
// - https://github.com/microsoft/vscode/issues/211933
// - https://github.com/xtermjs/xterm.js/issues/4067
export const DEFAULT_LINE_HEIGHT = isLinux ? 1.1 : 1;
export const MINIMUM_FONT_WEIGHT = 1;
export const MAXIMUM_FONT_WEIGHT = 1000;
export const DEFAULT_FONT_WEIGHT = 'normal';
export const DEFAULT_BOLD_FONT_WEIGHT = 'bold';
export const SUGGESTIONS_FONT_WEIGHT = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
export const ITerminalProfileResolverService = createDecorator('terminalProfileResolverService');
/*
 * When there were shell integration args injected
 * and createProcess returns an error, this exit code will be used.
 */
export const ShellIntegrationExitCode = 633;
export const ITerminalProfileService = createDecorator('terminalProfileService');
export const isTerminalProcessManager = (t) => typeof t.write === 'function';
export var ProcessState;
(function (ProcessState) {
    // The process has not been initialized yet.
    ProcessState[ProcessState["Uninitialized"] = 1] = "Uninitialized";
    // The process is currently launching, the process is marked as launching
    // for a short duration after being created and is helpful to indicate
    // whether the process died as a result of bad shell and args.
    ProcessState[ProcessState["Launching"] = 2] = "Launching";
    // The process is running normally.
    ProcessState[ProcessState["Running"] = 3] = "Running";
    // The process was killed during launch, likely as a result of bad shell and
    // args.
    ProcessState[ProcessState["KilledDuringLaunch"] = 4] = "KilledDuringLaunch";
    // The process was killed by the user (the event originated from VS Code).
    ProcessState[ProcessState["KilledByUser"] = 5] = "KilledByUser";
    // The process was killed by itself, for example the shell crashed or `exit`
    // was run.
    ProcessState[ProcessState["KilledByProcess"] = 6] = "KilledByProcess";
})(ProcessState || (ProcessState = {}));
export const QUICK_LAUNCH_PROFILE_CHOICE = 'workbench.action.terminal.profile.choice';
export var TerminalCommandId;
(function (TerminalCommandId) {
    TerminalCommandId["Toggle"] = "workbench.action.terminal.toggleTerminal";
    TerminalCommandId["Kill"] = "workbench.action.terminal.kill";
    TerminalCommandId["KillViewOrEditor"] = "workbench.action.terminal.killViewOrEditor";
    TerminalCommandId["KillEditor"] = "workbench.action.terminal.killEditor";
    TerminalCommandId["KillActiveTab"] = "workbench.action.terminal.killActiveTab";
    TerminalCommandId["KillAll"] = "workbench.action.terminal.killAll";
    TerminalCommandId["QuickKill"] = "workbench.action.terminal.quickKill";
    TerminalCommandId["ConfigureTerminalSettings"] = "workbench.action.terminal.openSettings";
    TerminalCommandId["ShellIntegrationLearnMore"] = "workbench.action.terminal.learnMore";
    TerminalCommandId["CopyLastCommand"] = "workbench.action.terminal.copyLastCommand";
    TerminalCommandId["CopyLastCommandOutput"] = "workbench.action.terminal.copyLastCommandOutput";
    TerminalCommandId["CopyLastCommandAndLastCommandOutput"] = "workbench.action.terminal.copyLastCommandAndLastCommandOutput";
    TerminalCommandId["CopyAndClearSelection"] = "workbench.action.terminal.copyAndClearSelection";
    TerminalCommandId["CopySelection"] = "workbench.action.terminal.copySelection";
    TerminalCommandId["CopySelectionAsHtml"] = "workbench.action.terminal.copySelectionAsHtml";
    TerminalCommandId["SelectAll"] = "workbench.action.terminal.selectAll";
    TerminalCommandId["DeleteWordLeft"] = "workbench.action.terminal.deleteWordLeft";
    TerminalCommandId["DeleteWordRight"] = "workbench.action.terminal.deleteWordRight";
    TerminalCommandId["DeleteToLineStart"] = "workbench.action.terminal.deleteToLineStart";
    TerminalCommandId["MoveToLineStart"] = "workbench.action.terminal.moveToLineStart";
    TerminalCommandId["MoveToLineEnd"] = "workbench.action.terminal.moveToLineEnd";
    TerminalCommandId["New"] = "workbench.action.terminal.new";
    TerminalCommandId["NewWithCwd"] = "workbench.action.terminal.newWithCwd";
    TerminalCommandId["NewLocal"] = "workbench.action.terminal.newLocal";
    TerminalCommandId["NewInActiveWorkspace"] = "workbench.action.terminal.newInActiveWorkspace";
    TerminalCommandId["NewWithProfile"] = "workbench.action.terminal.newWithProfile";
    TerminalCommandId["Split"] = "workbench.action.terminal.split";
    TerminalCommandId["SplitActiveTab"] = "workbench.action.terminal.splitActiveTab";
    TerminalCommandId["SplitInActiveWorkspace"] = "workbench.action.terminal.splitInActiveWorkspace";
    TerminalCommandId["Unsplit"] = "workbench.action.terminal.unsplit";
    TerminalCommandId["JoinActiveTab"] = "workbench.action.terminal.joinActiveTab";
    TerminalCommandId["Join"] = "workbench.action.terminal.join";
    TerminalCommandId["Relaunch"] = "workbench.action.terminal.relaunch";
    TerminalCommandId["FocusPreviousPane"] = "workbench.action.terminal.focusPreviousPane";
    TerminalCommandId["CreateTerminalEditor"] = "workbench.action.createTerminalEditor";
    TerminalCommandId["CreateTerminalEditorSameGroup"] = "workbench.action.createTerminalEditorSameGroup";
    TerminalCommandId["CreateTerminalEditorSide"] = "workbench.action.createTerminalEditorSide";
    TerminalCommandId["FocusTabs"] = "workbench.action.terminal.focusTabs";
    TerminalCommandId["FocusNextPane"] = "workbench.action.terminal.focusNextPane";
    TerminalCommandId["ResizePaneLeft"] = "workbench.action.terminal.resizePaneLeft";
    TerminalCommandId["ResizePaneRight"] = "workbench.action.terminal.resizePaneRight";
    TerminalCommandId["ResizePaneUp"] = "workbench.action.terminal.resizePaneUp";
    TerminalCommandId["SizeToContentWidth"] = "workbench.action.terminal.sizeToContentWidth";
    TerminalCommandId["SizeToContentWidthActiveTab"] = "workbench.action.terminal.sizeToContentWidthActiveTab";
    TerminalCommandId["ResizePaneDown"] = "workbench.action.terminal.resizePaneDown";
    TerminalCommandId["Focus"] = "workbench.action.terminal.focus";
    TerminalCommandId["FocusInstance"] = "workbench.action.terminal.focusInstance";
    TerminalCommandId["FocusNext"] = "workbench.action.terminal.focusNext";
    TerminalCommandId["FocusPrevious"] = "workbench.action.terminal.focusPrevious";
    TerminalCommandId["Paste"] = "workbench.action.terminal.paste";
    TerminalCommandId["PasteSelection"] = "workbench.action.terminal.pasteSelection";
    TerminalCommandId["SelectDefaultProfile"] = "workbench.action.terminal.selectDefaultShell";
    TerminalCommandId["RunSelectedText"] = "workbench.action.terminal.runSelectedText";
    TerminalCommandId["RunActiveFile"] = "workbench.action.terminal.runActiveFile";
    TerminalCommandId["SwitchTerminal"] = "workbench.action.terminal.switchTerminal";
    TerminalCommandId["ScrollDownLine"] = "workbench.action.terminal.scrollDown";
    TerminalCommandId["ScrollDownPage"] = "workbench.action.terminal.scrollDownPage";
    TerminalCommandId["ScrollToBottom"] = "workbench.action.terminal.scrollToBottom";
    TerminalCommandId["ScrollUpLine"] = "workbench.action.terminal.scrollUp";
    TerminalCommandId["ScrollUpPage"] = "workbench.action.terminal.scrollUpPage";
    TerminalCommandId["ScrollToTop"] = "workbench.action.terminal.scrollToTop";
    TerminalCommandId["Clear"] = "workbench.action.terminal.clear";
    TerminalCommandId["ClearSelection"] = "workbench.action.terminal.clearSelection";
    TerminalCommandId["ChangeIcon"] = "workbench.action.terminal.changeIcon";
    TerminalCommandId["ChangeIconActiveTab"] = "workbench.action.terminal.changeIconActiveTab";
    TerminalCommandId["ChangeColor"] = "workbench.action.terminal.changeColor";
    TerminalCommandId["ChangeColorActiveTab"] = "workbench.action.terminal.changeColorActiveTab";
    TerminalCommandId["Rename"] = "workbench.action.terminal.rename";
    TerminalCommandId["RenameActiveTab"] = "workbench.action.terminal.renameActiveTab";
    TerminalCommandId["RenameWithArgs"] = "workbench.action.terminal.renameWithArg";
    TerminalCommandId["ScrollToPreviousCommand"] = "workbench.action.terminal.scrollToPreviousCommand";
    TerminalCommandId["ScrollToNextCommand"] = "workbench.action.terminal.scrollToNextCommand";
    TerminalCommandId["SelectToPreviousCommand"] = "workbench.action.terminal.selectToPreviousCommand";
    TerminalCommandId["SelectToNextCommand"] = "workbench.action.terminal.selectToNextCommand";
    TerminalCommandId["SelectToPreviousLine"] = "workbench.action.terminal.selectToPreviousLine";
    TerminalCommandId["SelectToNextLine"] = "workbench.action.terminal.selectToNextLine";
    TerminalCommandId["SendSequence"] = "workbench.action.terminal.sendSequence";
    TerminalCommandId["SendSignal"] = "workbench.action.terminal.sendSignal";
    TerminalCommandId["AttachToSession"] = "workbench.action.terminal.attachToSession";
    TerminalCommandId["DetachSession"] = "workbench.action.terminal.detachSession";
    TerminalCommandId["MoveToEditor"] = "workbench.action.terminal.moveToEditor";
    TerminalCommandId["MoveToTerminalPanel"] = "workbench.action.terminal.moveToTerminalPanel";
    TerminalCommandId["MoveIntoNewWindow"] = "workbench.action.terminal.moveIntoNewWindow";
    TerminalCommandId["NewInNewWindow"] = "workbench.action.terminal.newInNewWindow";
    TerminalCommandId["SetDimensions"] = "workbench.action.terminal.setDimensions";
    TerminalCommandId["FocusHover"] = "workbench.action.terminal.focusHover";
    TerminalCommandId["ShowEnvironmentContributions"] = "workbench.action.terminal.showEnvironmentContributions";
    TerminalCommandId["StartVoice"] = "workbench.action.terminal.startVoice";
    TerminalCommandId["StopVoice"] = "workbench.action.terminal.stopVoice";
    TerminalCommandId["RevealCommand"] = "workbench.action.terminal.revealCommand";
})(TerminalCommandId || (TerminalCommandId = {}));
export const DEFAULT_COMMANDS_TO_SKIP_SHELL = [
    "workbench.action.terminal.clearSelection" /* TerminalCommandId.ClearSelection */,
    "workbench.action.terminal.clear" /* TerminalCommandId.Clear */,
    "workbench.action.terminal.copyAndClearSelection" /* TerminalCommandId.CopyAndClearSelection */,
    "workbench.action.terminal.copySelection" /* TerminalCommandId.CopySelection */,
    "workbench.action.terminal.copySelectionAsHtml" /* TerminalCommandId.CopySelectionAsHtml */,
    "workbench.action.terminal.copyLastCommand" /* TerminalCommandId.CopyLastCommand */,
    "workbench.action.terminal.copyLastCommandOutput" /* TerminalCommandId.CopyLastCommandOutput */,
    "workbench.action.terminal.copyLastCommandAndLastCommandOutput" /* TerminalCommandId.CopyLastCommandAndLastCommandOutput */,
    "workbench.action.terminal.deleteToLineStart" /* TerminalCommandId.DeleteToLineStart */,
    "workbench.action.terminal.deleteWordLeft" /* TerminalCommandId.DeleteWordLeft */,
    "workbench.action.terminal.deleteWordRight" /* TerminalCommandId.DeleteWordRight */,
    "workbench.action.terminal.focusNextPane" /* TerminalCommandId.FocusNextPane */,
    "workbench.action.terminal.focusNext" /* TerminalCommandId.FocusNext */,
    "workbench.action.terminal.focusPreviousPane" /* TerminalCommandId.FocusPreviousPane */,
    "workbench.action.terminal.focusPrevious" /* TerminalCommandId.FocusPrevious */,
    "workbench.action.terminal.focus" /* TerminalCommandId.Focus */,
    "workbench.action.terminal.sizeToContentWidth" /* TerminalCommandId.SizeToContentWidth */,
    "workbench.action.terminal.kill" /* TerminalCommandId.Kill */,
    "workbench.action.terminal.killEditor" /* TerminalCommandId.KillEditor */,
    "workbench.action.terminal.moveToEditor" /* TerminalCommandId.MoveToEditor */,
    "workbench.action.terminal.moveToLineEnd" /* TerminalCommandId.MoveToLineEnd */,
    "workbench.action.terminal.moveToLineStart" /* TerminalCommandId.MoveToLineStart */,
    "workbench.action.terminal.moveToTerminalPanel" /* TerminalCommandId.MoveToTerminalPanel */,
    "workbench.action.terminal.newInActiveWorkspace" /* TerminalCommandId.NewInActiveWorkspace */,
    "workbench.action.terminal.new" /* TerminalCommandId.New */,
    "workbench.action.terminal.newInNewWindow" /* TerminalCommandId.NewInNewWindow */,
    "workbench.action.terminal.paste" /* TerminalCommandId.Paste */,
    "workbench.action.terminal.pasteSelection" /* TerminalCommandId.PasteSelection */,
    "workbench.action.terminal.resizePaneDown" /* TerminalCommandId.ResizePaneDown */,
    "workbench.action.terminal.resizePaneLeft" /* TerminalCommandId.ResizePaneLeft */,
    "workbench.action.terminal.resizePaneRight" /* TerminalCommandId.ResizePaneRight */,
    "workbench.action.terminal.resizePaneUp" /* TerminalCommandId.ResizePaneUp */,
    "workbench.action.terminal.runActiveFile" /* TerminalCommandId.RunActiveFile */,
    "workbench.action.terminal.runSelectedText" /* TerminalCommandId.RunSelectedText */,
    "workbench.action.terminal.scrollDown" /* TerminalCommandId.ScrollDownLine */,
    "workbench.action.terminal.scrollDownPage" /* TerminalCommandId.ScrollDownPage */,
    "workbench.action.terminal.scrollToBottom" /* TerminalCommandId.ScrollToBottom */,
    "workbench.action.terminal.scrollToNextCommand" /* TerminalCommandId.ScrollToNextCommand */,
    "workbench.action.terminal.scrollToPreviousCommand" /* TerminalCommandId.ScrollToPreviousCommand */,
    "workbench.action.terminal.scrollToTop" /* TerminalCommandId.ScrollToTop */,
    "workbench.action.terminal.scrollUp" /* TerminalCommandId.ScrollUpLine */,
    "workbench.action.terminal.scrollUpPage" /* TerminalCommandId.ScrollUpPage */,
    "workbench.action.terminal.sendSequence" /* TerminalCommandId.SendSequence */,
    "workbench.action.terminal.selectAll" /* TerminalCommandId.SelectAll */,
    "workbench.action.terminal.selectToNextCommand" /* TerminalCommandId.SelectToNextCommand */,
    "workbench.action.terminal.selectToNextLine" /* TerminalCommandId.SelectToNextLine */,
    "workbench.action.terminal.selectToPreviousCommand" /* TerminalCommandId.SelectToPreviousCommand */,
    "workbench.action.terminal.selectToPreviousLine" /* TerminalCommandId.SelectToPreviousLine */,
    "workbench.action.terminal.splitInActiveWorkspace" /* TerminalCommandId.SplitInActiveWorkspace */,
    "workbench.action.terminal.split" /* TerminalCommandId.Split */,
    "workbench.action.terminal.toggleTerminal" /* TerminalCommandId.Toggle */,
    "workbench.action.terminal.focusHover" /* TerminalCommandId.FocusHover */,
    "editor.action.accessibilityHelp" /* AccessibilityCommandId.OpenAccessibilityHelp */,
    "workbench.action.terminal.stopVoice" /* TerminalCommandId.StopVoice */,
    "workbench.action.terminal.sendSignal" /* TerminalCommandId.SendSignal */,
    'workbench.action.tasks.rerunForActiveTerminal',
    'editor.action.toggleTabFocusMode',
    'notifications.hideList',
    'notifications.hideToasts',
    'workbench.action.closeQuickOpen',
    'workbench.action.quickOpen',
    'workbench.action.quickOpenPreviousEditor',
    'workbench.action.showCommands',
    'workbench.action.tasks.build',
    'workbench.action.tasks.restartTask',
    'workbench.action.tasks.runTask',
    'workbench.action.tasks.reRunTask',
    'workbench.action.tasks.showLog',
    'workbench.action.tasks.showTasks',
    'workbench.action.tasks.terminate',
    'workbench.action.tasks.test',
    'workbench.action.toggleFullScreen',
    'workbench.action.terminal.focusAtIndex1',
    'workbench.action.terminal.focusAtIndex2',
    'workbench.action.terminal.focusAtIndex3',
    'workbench.action.terminal.focusAtIndex4',
    'workbench.action.terminal.focusAtIndex5',
    'workbench.action.terminal.focusAtIndex6',
    'workbench.action.terminal.focusAtIndex7',
    'workbench.action.terminal.focusAtIndex8',
    'workbench.action.terminal.focusAtIndex9',
    'workbench.action.focusSecondEditorGroup',
    'workbench.action.focusThirdEditorGroup',
    'workbench.action.focusFourthEditorGroup',
    'workbench.action.focusFifthEditorGroup',
    'workbench.action.focusSixthEditorGroup',
    'workbench.action.focusSeventhEditorGroup',
    'workbench.action.focusEighthEditorGroup',
    'workbench.action.focusNextPart',
    'workbench.action.focusPreviousPart',
    'workbench.action.nextPanelView',
    'workbench.action.previousPanelView',
    'workbench.action.nextSideBarView',
    'workbench.action.previousSideBarView',
    'workbench.action.debug.disconnect',
    'workbench.action.debug.start',
    'workbench.action.debug.stop',
    'workbench.action.debug.run',
    'workbench.action.debug.restart',
    'workbench.action.debug.continue',
    'workbench.action.debug.pause',
    'workbench.action.debug.stepInto',
    'workbench.action.debug.stepOut',
    'workbench.action.debug.stepOver',
    'workbench.action.nextEditor',
    'workbench.action.previousEditor',
    'workbench.action.nextEditorInGroup',
    'workbench.action.previousEditorInGroup',
    'workbench.action.openNextRecentlyUsedEditor',
    'workbench.action.openPreviousRecentlyUsedEditor',
    'workbench.action.openNextRecentlyUsedEditorInGroup',
    'workbench.action.openPreviousRecentlyUsedEditorInGroup',
    'workbench.action.quickOpenPreviousRecentlyUsedEditor',
    'workbench.action.quickOpenLeastRecentlyUsedEditor',
    'workbench.action.quickOpenPreviousRecentlyUsedEditorInGroup',
    'workbench.action.quickOpenLeastRecentlyUsedEditorInGroup',
    'workbench.action.focusActiveEditorGroup',
    'workbench.action.focusFirstEditorGroup',
    'workbench.action.focusLastEditorGroup',
    'workbench.action.firstEditorInGroup',
    'workbench.action.lastEditorInGroup',
    'workbench.action.navigateUp',
    'workbench.action.navigateDown',
    'workbench.action.navigateRight',
    'workbench.action.navigateLeft',
    'workbench.action.togglePanel',
    'workbench.action.quickOpenView',
    'workbench.action.toggleMaximizedPanel',
    'workbench.action.zoomIn',
    'workbench.action.zoomOut',
    'workbench.action.zoomReset',
    'notification.acceptPrimaryAction',
    'runCommands',
    'workbench.action.terminal.chat.start',
    'workbench.action.terminal.chat.close',
    'workbench.action.terminal.chat.discard',
    'workbench.action.terminal.chat.makeRequest',
    'workbench.action.terminal.chat.cancel',
    'workbench.action.terminal.chat.feedbackHelpful',
    'workbench.action.terminal.chat.feedbackUnhelpful',
    'workbench.action.terminal.chat.feedbackReportIssue',
    'workbench.action.terminal.chat.runCommand',
    'workbench.action.terminal.chat.insertCommand',
    'workbench.action.terminal.chat.viewInChat',
    ...defaultTerminalContribCommandsToSkipShell,
];
export const terminalContributionsDescriptor = {
    extensionPoint: 'terminal',
    defaultExtensionKind: ['workspace'],
    activationEventsGenerator: function* (contribs) {
        for (const contrib of contribs) {
            for (const profileContrib of (contrib.profiles ?? [])) {
                yield `onTerminalProfile:${profileContrib.id}`;
            }
        }
    },
    jsonSchema: {
        description: nls.localize('vscode.extension.contributes.terminal', 'Contributes terminal functionality.'),
        type: 'object',
        properties: {
            profiles: {
                type: 'array',
                description: nls.localize('vscode.extension.contributes.terminal.profiles', "Defines additional terminal profiles that the user can create."),
                items: {
                    type: 'object',
                    required: ['id', 'title'],
                    defaultSnippets: [{
                            body: {
                                id: '$1',
                                title: '$2'
                            }
                        }],
                    properties: {
                        id: {
                            description: nls.localize('vscode.extension.contributes.terminal.profiles.id', "The ID of the terminal profile provider."),
                            type: 'string',
                        },
                        title: {
                            description: nls.localize('vscode.extension.contributes.terminal.profiles.title', "Title for this terminal profile."),
                            type: 'string',
                        },
                        icon: {
                            description: nls.localize('vscode.extension.contributes.terminal.types.icon', "A codicon, URI, or light and dark URIs to associate with this terminal type."),
                            anyOf: [{
                                    type: 'string',
                                },
                                {
                                    type: 'object',
                                    properties: {
                                        light: {
                                            description: nls.localize('vscode.extension.contributes.terminal.types.icon.light', 'Icon path when a light theme is used'),
                                            type: 'string'
                                        },
                                        dark: {
                                            description: nls.localize('vscode.extension.contributes.terminal.types.icon.dark', 'Icon path when a dark theme is used'),
                                            type: 'string'
                                        }
                                    }
                                }]
                        },
                        titleTemplate: {
                            description: nls.localize('vscode.extension.contributes.terminal.profiles.titleTemplate', "A title template string for the terminal tab. Supports variables like $\{sequence}, $\{process}, $\{cwd}, etc. Overrides the default terminal.integrated.tabs.title setting for terminals created with this profile."),
                            type: 'string',
                        },
                    },
                },
            },
            completionProviders: {
                type: 'array',
                description: nls.localize('vscode.extension.contributes.terminal.completionProviders', "Defines terminal completion providers that will be registered when the extension activates."),
                items: {
                    type: 'object',
                    required: ['id'],
                    defaultSnippets: [{
                            body: {
                                id: '$1',
                                description: '$2'
                            }
                        }],
                    properties: {
                        description: {
                            description: nls.localize('vscode.extension.contributes.terminal.completionProviders.description', "A description of what the completion provider does. This will be shown in the settings UI."),
                            type: 'string',
                        },
                    },
                },
            },
        },
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9jb21tb24vdGVybWluYWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsT0FBTyxFQUF1QixPQUFPLEVBQW1CLE1BQU0scUNBQXFDLENBQUM7QUFJcEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFPN0YsT0FBTyxFQUFFLHlDQUF5QyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFHekYsTUFBTSxDQUFDLE1BQU0sZ0JBQWdCLEdBQUcsVUFBVSxDQUFDO0FBRTNDLE1BQU0sQ0FBQyxNQUFNLDBCQUEwQixHQUFHLENBQUMsMENBQTBDLEVBQUUsK0JBQStCLEVBQUUsOEJBQThCLEVBQUUsaUNBQWlDLENBQUMsQ0FBQztBQUUzTCxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxxQkFBcUIsQ0FBQztBQUU3RCxNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxDQUFDLENBQUM7QUFDeEMsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDekMsK0ZBQStGO0FBQy9GLGlHQUFpRztBQUNqRyxPQUFPO0FBQ1Asc0RBQXNEO0FBQ3RELG9EQUFvRDtBQUNwRCxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBRXJELE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHLENBQUMsQ0FBQztBQUNyQyxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUM7QUFDeEMsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsUUFBUSxDQUFDO0FBQzVDLE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLE1BQU0sQ0FBQztBQUMvQyxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztBQUV6SCxNQUFNLENBQUMsTUFBTSwrQkFBK0IsR0FBRyxlQUFlLENBQWtDLGdDQUFnQyxDQUFDLENBQUM7QUFrQmxJOzs7R0FHRztBQUNILE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLEdBQUcsQ0FBQztBQU01QyxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxlQUFlLENBQTBCLHdCQUF3QixDQUFDLENBQUM7QUE4TTFHLE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLENBQUMsQ0FBaUQsRUFBZ0MsRUFBRSxDQUFDLE9BQVEsQ0FBNkIsQ0FBQyxLQUFLLEtBQUssVUFBVSxDQUFDO0FBdUN4TCxNQUFNLENBQU4sSUFBa0IsWUFpQmpCO0FBakJELFdBQWtCLFlBQVk7SUFDN0IsNENBQTRDO0lBQzVDLGlFQUFpQixDQUFBO0lBQ2pCLHlFQUF5RTtJQUN6RSxzRUFBc0U7SUFDdEUsOERBQThEO0lBQzlELHlEQUFhLENBQUE7SUFDYixtQ0FBbUM7SUFDbkMscURBQVcsQ0FBQTtJQUNYLDRFQUE0RTtJQUM1RSxRQUFRO0lBQ1IsMkVBQXNCLENBQUE7SUFDdEIsMEVBQTBFO0lBQzFFLCtEQUFnQixDQUFBO0lBQ2hCLDRFQUE0RTtJQUM1RSxXQUFXO0lBQ1gscUVBQW1CLENBQUE7QUFDcEIsQ0FBQyxFQWpCaUIsWUFBWSxLQUFaLFlBQVksUUFpQjdCO0FBbUVELE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUFHLDBDQUEwQyxDQUFDO0FBRXRGLE1BQU0sQ0FBTixJQUFrQixpQkEyRmpCO0FBM0ZELFdBQWtCLGlCQUFpQjtJQUNsQyx3RUFBbUQsQ0FBQTtJQUNuRCw0REFBdUMsQ0FBQTtJQUN2QyxvRkFBK0QsQ0FBQTtJQUMvRCx3RUFBbUQsQ0FBQTtJQUNuRCw4RUFBeUQsQ0FBQTtJQUN6RCxrRUFBNkMsQ0FBQTtJQUM3QyxzRUFBaUQsQ0FBQTtJQUNqRCx5RkFBb0UsQ0FBQTtJQUNwRSxzRkFBaUUsQ0FBQTtJQUNqRSxrRkFBNkQsQ0FBQTtJQUM3RCw4RkFBeUUsQ0FBQTtJQUN6RSwwSEFBcUcsQ0FBQTtJQUNyRyw4RkFBeUUsQ0FBQTtJQUN6RSw4RUFBeUQsQ0FBQTtJQUN6RCwwRkFBcUUsQ0FBQTtJQUNyRSxzRUFBaUQsQ0FBQTtJQUNqRCxnRkFBMkQsQ0FBQTtJQUMzRCxrRkFBNkQsQ0FBQTtJQUM3RCxzRkFBaUUsQ0FBQTtJQUNqRSxrRkFBNkQsQ0FBQTtJQUM3RCw4RUFBeUQsQ0FBQTtJQUN6RCwwREFBcUMsQ0FBQTtJQUNyQyx3RUFBbUQsQ0FBQTtJQUNuRCxvRUFBK0MsQ0FBQTtJQUMvQyw0RkFBdUUsQ0FBQTtJQUN2RSxnRkFBMkQsQ0FBQTtJQUMzRCw4REFBeUMsQ0FBQTtJQUN6QyxnRkFBMkQsQ0FBQTtJQUMzRCxnR0FBMkUsQ0FBQTtJQUMzRSxrRUFBNkMsQ0FBQTtJQUM3Qyw4RUFBeUQsQ0FBQTtJQUN6RCw0REFBdUMsQ0FBQTtJQUN2QyxvRUFBK0MsQ0FBQTtJQUMvQyxzRkFBaUUsQ0FBQTtJQUNqRSxtRkFBOEQsQ0FBQTtJQUM5RCxxR0FBZ0YsQ0FBQTtJQUNoRiwyRkFBc0UsQ0FBQTtJQUN0RSxzRUFBaUQsQ0FBQTtJQUNqRCw4RUFBeUQsQ0FBQTtJQUN6RCxnRkFBMkQsQ0FBQTtJQUMzRCxrRkFBNkQsQ0FBQTtJQUM3RCw0RUFBdUQsQ0FBQTtJQUN2RCx3RkFBbUUsQ0FBQTtJQUNuRSwwR0FBcUYsQ0FBQTtJQUNyRixnRkFBMkQsQ0FBQTtJQUMzRCw4REFBeUMsQ0FBQTtJQUN6Qyw4RUFBeUQsQ0FBQTtJQUN6RCxzRUFBaUQsQ0FBQTtJQUNqRCw4RUFBeUQsQ0FBQTtJQUN6RCw4REFBeUMsQ0FBQTtJQUN6QyxnRkFBMkQsQ0FBQTtJQUMzRCwwRkFBcUUsQ0FBQTtJQUNyRSxrRkFBNkQsQ0FBQTtJQUM3RCw4RUFBeUQsQ0FBQTtJQUN6RCxnRkFBMkQsQ0FBQTtJQUMzRCw0RUFBdUQsQ0FBQTtJQUN2RCxnRkFBMkQsQ0FBQTtJQUMzRCxnRkFBMkQsQ0FBQTtJQUMzRCx3RUFBbUQsQ0FBQTtJQUNuRCw0RUFBdUQsQ0FBQTtJQUN2RCwwRUFBcUQsQ0FBQTtJQUNyRCw4REFBeUMsQ0FBQTtJQUN6QyxnRkFBMkQsQ0FBQTtJQUMzRCx3RUFBbUQsQ0FBQTtJQUNuRCwwRkFBcUUsQ0FBQTtJQUNyRSwwRUFBcUQsQ0FBQTtJQUNyRCw0RkFBdUUsQ0FBQTtJQUN2RSxnRUFBMkMsQ0FBQTtJQUMzQyxrRkFBNkQsQ0FBQTtJQUM3RCwrRUFBMEQsQ0FBQTtJQUMxRCxrR0FBNkUsQ0FBQTtJQUM3RSwwRkFBcUUsQ0FBQTtJQUNyRSxrR0FBNkUsQ0FBQTtJQUM3RSwwRkFBcUUsQ0FBQTtJQUNyRSw0RkFBdUUsQ0FBQTtJQUN2RSxvRkFBK0QsQ0FBQTtJQUMvRCw0RUFBdUQsQ0FBQTtJQUN2RCx3RUFBbUQsQ0FBQTtJQUNuRCxrRkFBNkQsQ0FBQTtJQUM3RCw4RUFBeUQsQ0FBQTtJQUN6RCw0RUFBdUQsQ0FBQTtJQUN2RCwwRkFBcUUsQ0FBQTtJQUNyRSxzRkFBaUUsQ0FBQTtJQUNqRSxnRkFBMkQsQ0FBQTtJQUMzRCw4RUFBeUQsQ0FBQTtJQUN6RCx3RUFBbUQsQ0FBQTtJQUNuRCw0R0FBdUYsQ0FBQTtJQUN2Rix3RUFBbUQsQ0FBQTtJQUNuRCxzRUFBaUQsQ0FBQTtJQUNqRCw4RUFBeUQsQ0FBQTtBQUMxRCxDQUFDLEVBM0ZpQixpQkFBaUIsS0FBakIsaUJBQWlCLFFBMkZsQztBQUVELE1BQU0sQ0FBQyxNQUFNLDhCQUE4QixHQUFhOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztJQXdEdkQsK0NBQStDO0lBQy9DLGtDQUFrQztJQUNsQyx3QkFBd0I7SUFDeEIsMEJBQTBCO0lBQzFCLGlDQUFpQztJQUNqQyw0QkFBNEI7SUFDNUIsMENBQTBDO0lBQzFDLCtCQUErQjtJQUMvQiw4QkFBOEI7SUFDOUIsb0NBQW9DO0lBQ3BDLGdDQUFnQztJQUNoQyxrQ0FBa0M7SUFDbEMsZ0NBQWdDO0lBQ2hDLGtDQUFrQztJQUNsQyxrQ0FBa0M7SUFDbEMsNkJBQTZCO0lBQzdCLG1DQUFtQztJQUNuQyx5Q0FBeUM7SUFDekMseUNBQXlDO0lBQ3pDLHlDQUF5QztJQUN6Qyx5Q0FBeUM7SUFDekMseUNBQXlDO0lBQ3pDLHlDQUF5QztJQUN6Qyx5Q0FBeUM7SUFDekMseUNBQXlDO0lBQ3pDLHlDQUF5QztJQUN6Qyx5Q0FBeUM7SUFDekMsd0NBQXdDO0lBQ3hDLHlDQUF5QztJQUN6Qyx3Q0FBd0M7SUFDeEMsd0NBQXdDO0lBQ3hDLDBDQUEwQztJQUMxQyx5Q0FBeUM7SUFDekMsZ0NBQWdDO0lBQ2hDLG9DQUFvQztJQUNwQyxnQ0FBZ0M7SUFDaEMsb0NBQW9DO0lBQ3BDLGtDQUFrQztJQUNsQyxzQ0FBc0M7SUFDdEMsbUNBQW1DO0lBQ25DLDhCQUE4QjtJQUM5Qiw2QkFBNkI7SUFDN0IsNEJBQTRCO0lBQzVCLGdDQUFnQztJQUNoQyxpQ0FBaUM7SUFDakMsOEJBQThCO0lBQzlCLGlDQUFpQztJQUNqQyxnQ0FBZ0M7SUFDaEMsaUNBQWlDO0lBQ2pDLDZCQUE2QjtJQUM3QixpQ0FBaUM7SUFDakMsb0NBQW9DO0lBQ3BDLHdDQUF3QztJQUN4Qyw2Q0FBNkM7SUFDN0MsaURBQWlEO0lBQ2pELG9EQUFvRDtJQUNwRCx3REFBd0Q7SUFDeEQsc0RBQXNEO0lBQ3RELG1EQUFtRDtJQUNuRCw2REFBNkQ7SUFDN0QsMERBQTBEO0lBQzFELHlDQUF5QztJQUN6Qyx3Q0FBd0M7SUFDeEMsdUNBQXVDO0lBQ3ZDLHFDQUFxQztJQUNyQyxvQ0FBb0M7SUFDcEMsNkJBQTZCO0lBQzdCLCtCQUErQjtJQUMvQixnQ0FBZ0M7SUFDaEMsK0JBQStCO0lBQy9CLDhCQUE4QjtJQUM5QixnQ0FBZ0M7SUFDaEMsdUNBQXVDO0lBQ3ZDLHlCQUF5QjtJQUN6QiwwQkFBMEI7SUFDMUIsNEJBQTRCO0lBQzVCLGtDQUFrQztJQUNsQyxhQUFhO0lBQ2Isc0NBQXNDO0lBQ3RDLHNDQUFzQztJQUN0Qyx3Q0FBd0M7SUFDeEMsNENBQTRDO0lBQzVDLHVDQUF1QztJQUN2QyxnREFBZ0Q7SUFDaEQsa0RBQWtEO0lBQ2xELG9EQUFvRDtJQUNwRCwyQ0FBMkM7SUFDM0MsOENBQThDO0lBQzlDLDJDQUEyQztJQUMzQyxHQUFHLHlDQUF5QztDQUM1QyxDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0sK0JBQStCLEdBQXNEO0lBQ2pHLGNBQWMsRUFBRSxVQUFVO0lBQzFCLG9CQUFvQixFQUFFLENBQUMsV0FBVyxDQUFDO0lBQ25DLHlCQUF5QixFQUFFLFFBQVEsQ0FBQyxFQUFFLFFBQTJDO1FBQ2hGLEtBQUssTUFBTSxPQUFPLElBQUksUUFBUSxFQUFFLENBQUM7WUFDaEMsS0FBSyxNQUFNLGNBQWMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFDdkQsTUFBTSxxQkFBcUIsY0FBYyxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2hELENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUNELFVBQVUsRUFBRTtRQUNYLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHVDQUF1QyxFQUFFLHFDQUFxQyxDQUFDO1FBQ3pHLElBQUksRUFBRSxRQUFRO1FBQ2QsVUFBVSxFQUFFO1lBQ1gsUUFBUSxFQUFFO2dCQUNULElBQUksRUFBRSxPQUFPO2dCQUNiLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGdEQUFnRCxFQUFFLGdFQUFnRSxDQUFDO2dCQUM3SSxLQUFLLEVBQUU7b0JBQ04sSUFBSSxFQUFFLFFBQVE7b0JBQ2QsUUFBUSxFQUFFLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQztvQkFDekIsZUFBZSxFQUFFLENBQUM7NEJBQ2pCLElBQUksRUFBRTtnQ0FDTCxFQUFFLEVBQUUsSUFBSTtnQ0FDUixLQUFLLEVBQUUsSUFBSTs2QkFDWDt5QkFDRCxDQUFDO29CQUNGLFVBQVUsRUFBRTt3QkFDWCxFQUFFLEVBQUU7NEJBQ0gsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsbURBQW1ELEVBQUUsMENBQTBDLENBQUM7NEJBQzFILElBQUksRUFBRSxRQUFRO3lCQUNkO3dCQUNELEtBQUssRUFBRTs0QkFDTixXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxzREFBc0QsRUFBRSxrQ0FBa0MsQ0FBQzs0QkFDckgsSUFBSSxFQUFFLFFBQVE7eUJBQ2Q7d0JBQ0QsSUFBSSxFQUFFOzRCQUNMLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGtEQUFrRCxFQUFFLDhFQUE4RSxDQUFDOzRCQUM3SixLQUFLLEVBQUUsQ0FBQztvQ0FDUCxJQUFJLEVBQUUsUUFBUTtpQ0FDZDtnQ0FDRDtvQ0FDQyxJQUFJLEVBQUUsUUFBUTtvQ0FDZCxVQUFVLEVBQUU7d0NBQ1gsS0FBSyxFQUFFOzRDQUNOLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHdEQUF3RCxFQUFFLHNDQUFzQyxDQUFDOzRDQUMzSCxJQUFJLEVBQUUsUUFBUTt5Q0FDZDt3Q0FDRCxJQUFJLEVBQUU7NENBQ0wsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsdURBQXVELEVBQUUscUNBQXFDLENBQUM7NENBQ3pILElBQUksRUFBRSxRQUFRO3lDQUNkO3FDQUNEO2lDQUNELENBQUM7eUJBQ0Y7d0JBQ0QsYUFBYSxFQUFFOzRCQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDhEQUE4RCxFQUFFLHNOQUFzTixDQUFDOzRCQUNqVCxJQUFJLEVBQUUsUUFBUTt5QkFDZDtxQkFDRDtpQkFDRDthQUNEO1lBQ0QsbUJBQW1CLEVBQUU7Z0JBQ3BCLElBQUksRUFBRSxPQUFPO2dCQUNiLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDJEQUEyRCxFQUFFLDZGQUE2RixDQUFDO2dCQUNyTCxLQUFLLEVBQUU7b0JBQ04sSUFBSSxFQUFFLFFBQVE7b0JBQ2QsUUFBUSxFQUFFLENBQUMsSUFBSSxDQUFDO29CQUNoQixlQUFlLEVBQUUsQ0FBQzs0QkFDakIsSUFBSSxFQUFFO2dDQUNMLEVBQUUsRUFBRSxJQUFJO2dDQUNSLFdBQVcsRUFBRSxJQUFJOzZCQUNqQjt5QkFDRCxDQUFDO29CQUNGLFVBQVUsRUFBRTt3QkFDWCxXQUFXLEVBQUU7NEJBQ1osV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsdUVBQXVFLEVBQUUsNEZBQTRGLENBQUM7NEJBQ2hNLElBQUksRUFBRSxRQUFRO3lCQUNkO3FCQUNEO2lCQUNEO2FBQ0Q7U0FDRDtLQUNEO0NBQ0QsQ0FBQyJ9