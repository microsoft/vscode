/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import themePickerContent from './media/theme_picker.js';
import themePickerSmallContent from './media/theme_picker_small.js';
import notebookProfileContent from './media/notebookProfile.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { NotebookSetting } from '../../notebook/common/notebookCommon.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../platform/accessibility/common/accessibility.js';
import product from '../../../../platform/product/common/product.js';
const defaultChat = {
    documentationUrl: product.defaultChatAgent?.documentationUrl ?? '',
    manageSettingsUrl: product.defaultChatAgent?.manageSettingsUrl ?? '',
    provider: product.defaultChatAgent?.provider ?? { default: { name: '' } },
    publicCodeMatchesUrl: product.defaultChatAgent?.publicCodeMatchesUrl ?? '',
    termsStatementUrl: product.defaultChatAgent?.termsStatementUrl ?? '',
    privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? ''
};
export const copilotSettingsMessage = localize({ key: 'settings', comment: ['{Locked="["}', '{Locked="]({0})"}', '{Locked="]({1})"}'] }, "{0} Copilot may show [public code]({1}) suggestions and use your data to improve the product. You can change these [settings]({2}) anytime.", defaultChat.provider.default.name, defaultChat.publicCodeMatchesUrl, defaultChat.manageSettingsUrl);
class GettingStartedContentProviderRegistry {
    constructor() {
        this.providers = new Map();
    }
    registerProvider(moduleId, provider) {
        this.providers.set(moduleId, provider);
    }
    getProvider(moduleId) {
        return this.providers.get(moduleId);
    }
}
export const gettingStartedContentRegistry = new GettingStartedContentProviderRegistry();
export async function moduleToContent(resource) {
    if (!resource.query) {
        throw new Error('Getting Started: invalid resource');
    }
    const query = JSON.parse(resource.query);
    if (!query.moduleId) {
        throw new Error('Getting Started: invalid resource');
    }
    const provider = gettingStartedContentRegistry.getProvider(query.moduleId);
    if (!provider) {
        throw new Error(`Getting Started: no provider registered for ${query.moduleId}`);
    }
    return provider();
}
gettingStartedContentRegistry.registerProvider('vs/workbench/contrib/welcomeGettingStarted/common/media/theme_picker', themePickerContent);
gettingStartedContentRegistry.registerProvider('vs/workbench/contrib/welcomeGettingStarted/common/media/theme_picker_small', themePickerSmallContent);
gettingStartedContentRegistry.registerProvider('vs/workbench/contrib/welcomeGettingStarted/common/media/notebookProfile', notebookProfileContent);
// Register empty media for accessibility walkthrough
gettingStartedContentRegistry.registerProvider('vs/workbench/contrib/welcomeGettingStarted/common/media/empty', () => '');
const setupIcon = registerIcon('getting-started-setup', Codicon.zap, localize('getting-started-setup-icon', "Icon used for the setup category of welcome page"));
const beginnerIcon = registerIcon('getting-started-beginner', Codicon.lightbulb, localize('getting-started-beginner-icon', "Icon used for the beginner category of welcome page"));
export const startEntries = [
    {
        id: 'welcome.showNewFileEntries',
        title: localize('gettingStarted.newFile.title', "New File..."),
        description: localize('gettingStarted.newFile.description', "Open a new untitled text file, notebook, or custom editor."),
        icon: Codicon.newFile,
        content: {
            type: 'startEntry',
            command: 'command:welcome.showNewFileEntries',
        }
    },
    {
        id: 'topLevelOpenMac',
        title: localize('gettingStarted.openMac.title', "Open..."),
        description: localize('gettingStarted.openMac.description', "Open a file or folder to start working"),
        icon: Codicon.folderOpened,
        when: '!isWeb && isMac',
        content: {
            type: 'startEntry',
            command: 'command:workbench.action.files.openFileFolder',
        }
    },
    {
        id: 'topLevelOpenFile',
        title: localize('gettingStarted.openFile.title', "Open File..."),
        description: localize('gettingStarted.openFile.description', "Open a file to start working"),
        icon: Codicon.goToFile,
        when: 'isWeb || !isMac',
        content: {
            type: 'startEntry',
            command: 'command:workbench.action.files.openFile',
        }
    },
    {
        id: 'topLevelOpenFolder',
        title: localize('gettingStarted.openFolder.title', "Open Folder..."),
        description: localize('gettingStarted.openFolder.description', "Open a folder to start working"),
        icon: Codicon.folderOpened,
        when: '!isWeb && !isMac',
        content: {
            type: 'startEntry',
            command: 'command:workbench.action.files.openFolder',
        }
    },
    {
        id: 'topLevelOpenFolderWeb',
        title: localize('gettingStarted.openFolder.title', "Open Folder..."),
        description: localize('gettingStarted.openFolder.description', "Open a folder to start working"),
        icon: Codicon.folderOpened,
        when: '!openFolderWorkspaceSupport && workbenchState == \'workspace\'',
        content: {
            type: 'startEntry',
            command: 'command:workbench.action.files.openFolderViaWorkspace',
        }
    },
    {
        id: 'topLevelGitClone',
        title: localize('gettingStarted.topLevelGitClone.title', "Clone Git Repository..."),
        description: localize('gettingStarted.topLevelGitClone.description', "Clone a remote repository to a local folder"),
        when: 'config.git.enabled && !git.missing',
        icon: Codicon.sourceControl,
        content: {
            type: 'startEntry',
            command: 'command:git.clone',
        }
    },
    {
        id: 'topLevelGitOpen',
        title: localize('gettingStarted.topLevelGitOpen.title', "Open Repository..."),
        description: localize('gettingStarted.topLevelGitOpen.description', "Connect to a remote repository or pull request to browse, search, edit, and commit"),
        when: 'workspacePlatform == \'webworker\'',
        icon: Codicon.sourceControl,
        content: {
            type: 'startEntry',
            command: 'command:remoteHub.openRepository',
        }
    },
    {
        id: 'topLevelRemoteOpen',
        title: localize('gettingStarted.topLevelRemoteOpen.title', "Connect to..."),
        description: localize('gettingStarted.topLevelRemoteOpen.description', "Connect to remote development workspaces."),
        when: '!isWeb',
        icon: Codicon.remote,
        content: {
            type: 'startEntry',
            command: 'command:workbench.action.remote.showMenu',
        }
    },
    {
        id: 'topLevelOpenTunnel',
        title: localize('gettingStarted.topLevelOpenTunnel.title', "Open Tunnel..."),
        description: localize('gettingStarted.topLevelOpenTunnel.description', "Connect to a remote machine through a Tunnel"),
        when: 'isWeb && showRemoteStartEntryInWeb',
        icon: Codicon.remote,
        content: {
            type: 'startEntry',
            command: 'command:workbench.action.remote.showWebStartEntryActions',
        }
    },
    {
        id: 'topLevelNewWorkspaceChat',
        title: localize('gettingStarted.newWorkspaceChat.title', "Generate New Workspace..."),
        description: localize('gettingStarted.newWorkspaceChat.description', "Chat to create a new workspace"),
        icon: Codicon.chatSparkle,
        when: '!isWeb && !chatSetupHidden',
        content: {
            type: 'startEntry',
            command: 'command:welcome.newWorkspaceChat',
        }
    },
];
const Button = (title, href) => `[${title}](${href})`;
const CopilotStepTitle = localize('gettingStarted.copilotSetup.title', "Use AI features with Copilot for free");
const CopilotDescription = localize({ key: 'gettingStarted.copilotSetup.description', comment: ['{Locked="["}', '{Locked="]({0})"}'] }, "You can use [Copilot]({0}) to generate code across multiple files, fix errors, ask questions about your code, and much more using natural language.", defaultChat.documentationUrl ?? '');
const CopilotTermsString = localize({ key: 'gettingStarted.copilotSetup.terms', comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})", defaultChat.provider.default.name, defaultChat.provider.default.name, defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl);
const CopilotAnonymousButton = Button(localize('setupCopilotButton.setup', "Use AI Features"), `command:workbench.action.chat.triggerSetupAnonymousWithoutDialog`);
const CopilotSignedOutButton = Button(localize('setupCopilotButton.setup', "Use AI Features"), `command:workbench.action.chat.triggerSetup`);
const CopilotSignedInButton = Button(localize('setupCopilotButton.setup', "Use AI Features"), `command:workbench.action.chat.triggerSetup`);
const CopilotCompleteButton = Button(localize('setupCopilotButton.chatWithCopilot', "Start to Chat"), 'command:workbench.action.chat.open');
function createCopilotSetupStep(id, button, when, includeTerms) {
    const description = includeTerms ?
        `${CopilotDescription}\n${CopilotTermsString}\n${button}` :
        `${CopilotDescription}\n${button}`;
    return {
        id,
        title: CopilotStepTitle,
        description,
        when: `${when} && !chatSetupHidden`,
        media: {
            type: 'svg', altText: 'VS Code Copilot multi file edits', path: 'multi-file-edits.svg'
        },
    };
}
export const walkthroughs = [
    {
        id: 'Setup',
        title: localize('gettingStarted.setup.title', "Get started with VS Code"),
        description: localize('gettingStarted.setup.description', "Customize your editor, learn the basics, and start coding"),
        isFeatured: true,
        icon: setupIcon,
        when: '!isWeb',
        walkthroughPageTitle: localize('gettingStarted.setup.walkthroughPageTitle', 'Setup VS Code'),
        next: 'Beginner',
        content: {
            type: 'steps',
            steps: [
                createCopilotSetupStep('CopilotSetupAnonymous', CopilotAnonymousButton, 'chatAnonymous && !chatSetupCompleted', true),
                createCopilotSetupStep('CopilotSetupSignedOut', CopilotSignedOutButton, 'chatEntitlementSignedOut && !chatAnonymous', false),
                createCopilotSetupStep('CopilotSetupComplete', CopilotCompleteButton, 'chatSetupCompleted && !chatSetupDisabled && (chatAnonymous || chatPlanPro || chatPlanProPlus || chatPlanBusiness || chatPlanEnterprise || chatPlanFree)', false),
                createCopilotSetupStep('CopilotSetupSignedIn', CopilotSignedInButton, '!chatEntitlementSignedOut && (!chatSetupCompleted || chatSetupDisabled || chatPlanCanSignUp)', false),
                {
                    id: 'pickColorTheme',
                    title: localize('gettingStarted.pickColor.title', "Choose your theme"),
                    description: localize('gettingStarted.pickColor.description.interpolated', "The right theme helps you focus on your code, is easy on your eyes, and is simply more fun to use.\n{0}", Button(localize('titleID', "Browse Color Themes"), 'command:workbench.action.selectTheme')),
                    completionEvents: [
                        'onSettingChanged:workbench.colorTheme',
                        'onCommand:workbench.action.selectTheme'
                    ],
                    media: { type: 'markdown', path: 'theme_picker', }
                },
                {
                    id: 'videoTutorial',
                    title: localize('gettingStarted.videoTutorial.title', "Watch video tutorials"),
                    description: localize('gettingStarted.videoTutorial.description.interpolated', "Watch the first in a series of short & practical video tutorials for VS Code's key features.\n{0}", Button(localize('watch', "Watch Tutorial"), 'https://aka.ms/vscode-getting-started-video')),
                    media: { type: 'svg', altText: 'VS Code Settings', path: 'learn.svg' },
                }
            ]
        }
    },
    {
        id: 'SetupWeb',
        title: localize('gettingStarted.setupWeb.title', "Get Started with VS Code for the Web"),
        description: localize('gettingStarted.setupWeb.description', "Customize your editor, learn the basics, and start coding"),
        isFeatured: true,
        icon: setupIcon,
        when: 'isWeb',
        next: 'Beginner',
        walkthroughPageTitle: localize('gettingStarted.setupWeb.walkthroughPageTitle', 'Setup VS Code Web'),
        content: {
            type: 'steps',
            steps: [
                {
                    id: 'pickColorThemeWeb',
                    title: localize('gettingStarted.pickColor.title', "Choose your theme"),
                    description: localize('gettingStarted.pickColor.description.interpolated', "The right theme helps you focus on your code, is easy on your eyes, and is simply more fun to use.\n{0}", Button(localize('titleID', "Browse Color Themes"), 'command:workbench.action.selectTheme')),
                    completionEvents: [
                        'onSettingChanged:workbench.colorTheme',
                        'onCommand:workbench.action.selectTheme'
                    ],
                    media: { type: 'markdown', path: 'theme_picker', }
                },
                {
                    id: 'menuBarWeb',
                    title: localize('gettingStarted.menuBar.title', "Just the right amount of UI"),
                    description: localize('gettingStarted.menuBar.description.interpolated', "The full menu bar is available in the dropdown menu to make room for your code. Toggle its appearance for faster access. \n{0}", Button(localize('toggleMenuBar', "Toggle Menu Bar"), 'command:workbench.action.toggleMenuBar')),
                    when: 'isWeb',
                    media: {
                        type: 'svg', altText: 'Comparing menu dropdown with the visible menu bar.', path: 'menuBar.svg'
                    },
                },
                {
                    id: 'extensionsWebWeb',
                    title: localize('gettingStarted.extensions.title', "Code with extensions"),
                    description: localize('gettingStarted.extensionsWeb.description.interpolated', "Extensions are VS Code's power-ups. A growing number are becoming available in the web.\n{0}", Button(localize('browsePopularWeb', "Browse Popular Web Extensions"), 'command:workbench.extensions.action.showPopularExtensions')),
                    when: 'workspacePlatform == \'webworker\'',
                    media: {
                        type: 'svg', altText: 'VS Code extension marketplace with featured language extensions', path: 'extensions-web.svg'
                    },
                },
                {
                    id: 'findLanguageExtensionsWeb',
                    title: localize('gettingStarted.findLanguageExts.title', "Rich support for all your languages"),
                    description: localize('gettingStarted.findLanguageExts.description.interpolated', "Code smarter with syntax highlighting, inline suggestions, linting and debugging. While many languages are built-in, many more can be added as extensions.\n{0}", Button(localize('browseLangExts', "Browse Language Extensions"), 'command:workbench.extensions.action.showLanguageExtensions')),
                    when: 'workspacePlatform != \'webworker\'',
                    media: {
                        type: 'svg', altText: 'Language extensions', path: 'languages.svg'
                    },
                },
                {
                    id: 'settingsSyncWeb',
                    title: localize('gettingStarted.settingsSync.title', "Sync settings across devices"),
                    description: localize('gettingStarted.settingsSync.description.interpolated', "Keep your essential customizations backed up and updated across all your devices.\n{0}", Button(localize('enableSync', "Backup and Sync Settings"), 'command:workbench.userDataSync.actions.turnOn')),
                    when: 'syncStatus != uninitialized',
                    completionEvents: ['onEvent:sync-enabled'],
                    media: {
                        type: 'svg', altText: 'The "Turn on Sync" entry in the settings gear menu.', path: 'settingsSync.svg'
                    },
                },
                {
                    id: 'commandPaletteTaskWeb',
                    title: localize('gettingStarted.commandPalette.title', "Unlock productivity with the Command Palette "),
                    description: localize('gettingStarted.commandPalette.description.interpolated', "Run commands without reaching for your mouse to accomplish any task in VS Code.\n{0}", Button(localize('commandPalette', "Open Command Palette"), 'command:workbench.action.showCommands')),
                    media: { type: 'svg', altText: 'Command Palette overlay for searching and executing commands.', path: 'commandPalette.svg' },
                },
                {
                    id: 'pickAFolderTask-WebWeb',
                    title: localize('gettingStarted.setup.OpenFolder.title', "Open up your code"),
                    description: localize('gettingStarted.setup.OpenFolderWeb.description.interpolated', "You're all set to start coding. You can open a local project or a remote repository to get your files into VS Code.\n{0}\n{1}", Button(localize('openFolder', "Open Folder"), 'command:workbench.action.addRootFolder'), Button(localize('openRepository', "Open Repository"), 'command:remoteHub.openRepository')),
                    when: 'workspaceFolderCount == 0',
                    media: {
                        type: 'svg', altText: 'Explorer view showing buttons for opening folder and cloning repository.', path: 'openFolder.svg'
                    }
                },
                {
                    id: 'quickOpenWeb',
                    title: localize('gettingStarted.quickOpen.title', "Quickly navigate between your files"),
                    description: localize('gettingStarted.quickOpen.description.interpolated', "Navigate between files in an instant with one keystroke. Tip: Open multiple files by pressing the right arrow key.\n{0}", Button(localize('quickOpen', "Quick Open a File"), 'command:toSide:workbench.action.quickOpen')),
                    when: 'workspaceFolderCount != 0',
                    media: {
                        type: 'svg', altText: 'Go to file in quick search.', path: 'search.svg'
                    }
                }
            ]
        }
    },
    {
        id: 'SetupAccessibility',
        title: localize('gettingStarted.setupAccessibility.title', "Get Started with Accessibility Features"),
        description: localize('gettingStarted.setupAccessibility.description', "Learn the tools and shortcuts that make VS Code accessible. Note that some actions are not actionable from within the context of the walkthrough."),
        isFeatured: true,
        icon: setupIcon,
        when: CONTEXT_ACCESSIBILITY_MODE_ENABLED.key,
        next: 'Setup',
        walkthroughPageTitle: localize('gettingStarted.setupAccessibility.walkthroughPageTitle', 'Setup VS Code Accessibility'),
        content: {
            type: 'steps',
            steps: [
                {
                    id: 'accessibilityHelp',
                    title: localize('gettingStarted.accessibilityHelp.title', "Use the accessibility help dialog to learn about features"),
                    description: localize('gettingStarted.accessibilityHelp.description.interpolated', "The accessibility help dialog provides information about what to expect from a feature and the commands/keybindings to operate them.\n With focus in an editor, terminal, notebook, chat response, comment, or debug console, the relevant dialog can be opened with the Open Accessibility Help command.\n{0}", Button(localize('openAccessibilityHelp', "Open Accessibility Help"), 'command:editor.action.accessibilityHelp')),
                    media: {
                        type: 'markdown', path: 'empty'
                    }
                },
                {
                    id: 'accessibleView',
                    title: localize('gettingStarted.accessibleView.title', "Screen reader users can inspect content line by line, character by character in the accessible view."),
                    description: localize('gettingStarted.accessibleView.description.interpolated', "The accessible view is available for the terminal, hovers, notifications, comments, notebook output, chat responses, inline completions, and debug console output.\n With focus in any of those features, it can be opened with the Open Accessible View command.\n{0}", Button(localize('openAccessibleView', "Open Accessible View"), 'command:editor.action.accessibleView')),
                    media: {
                        type: 'markdown', path: 'empty'
                    }
                },
                {
                    id: 'verbositySettings',
                    title: localize('gettingStarted.verbositySettings.title', "Control the verbosity of aria labels"),
                    description: localize('gettingStarted.verbositySettings.description.interpolated', "Screen reader verbosity settings exist for features around the workbench so that once a user is familiar with a feature, they can avoid hearing hints about how to operate it. For example, features for which an accessibility help dialog exists will indicate how to open the dialog until the verbosity setting for that feature has been disabled.\n These and other accessibility settings can be configured by running the Open Accessibility Settings command.\n{0}", Button(localize('openVerbositySettings', "Open Accessibility Settings"), 'command:workbench.action.openAccessibilitySettings')),
                    media: {
                        type: 'markdown', path: 'empty'
                    }
                },
                {
                    id: 'commandPaletteTaskAccessibility',
                    title: localize('gettingStarted.commandPaletteAccessibility.title', "Unlock productivity with the Command Palette "),
                    description: localize('gettingStarted.commandPaletteAccessibility.description.interpolated', "Run commands without reaching for your mouse to accomplish any task in VS Code.\n{0}", Button(localize('commandPalette', "Open Command Palette"), 'command:workbench.action.showCommands')),
                    media: { type: 'markdown', path: 'empty' },
                },
                {
                    id: 'keybindingsAccessibility',
                    title: localize('gettingStarted.keyboardShortcuts.title', "Customize your keyboard shortcuts"),
                    description: localize('gettingStarted.keyboardShortcuts.description.interpolated', "Once you have discovered your favorite commands, create custom keyboard shortcuts for instant access.\n{0}", Button(localize('keyboardShortcuts', "Keyboard Shortcuts"), 'command:toSide:workbench.action.openGlobalKeybindings')),
                    media: {
                        type: 'markdown', path: 'empty',
                    }
                },
                {
                    id: 'accessibilitySignals',
                    title: localize('gettingStarted.accessibilitySignals.title', "Fine tune which accessibility signals you want to receive via audio or a braille device"),
                    description: localize('gettingStarted.accessibilitySignals.description.interpolated', "Accessibility sounds and announcements are played around the workbench for different events.\n These can be discovered and configured using the List Signal Sounds and List Signal Announcements commands.\n{0}\n{1}", Button(localize('listSignalSounds', "List Signal Sounds"), 'command:signals.sounds.help'), Button(localize('listSignalAnnouncements', "List Signal Announcements"), 'command:accessibility.announcement.help')),
                    media: {
                        type: 'markdown', path: 'empty'
                    }
                },
                {
                    id: 'hover',
                    title: localize('gettingStarted.hover.title', "Access the hover in the editor to get more information on a variable or symbol"),
                    description: localize('gettingStarted.hover.description.interpolated', "While focus is in the editor on a variable or symbol, a hover can be focused with the Show or Open Hover command.\n{0}", Button(localize('showOrFocusHover', "Show or Focus Hover"), 'command:editor.action.showHover')),
                    media: {
                        type: 'markdown', path: 'empty'
                    }
                },
                {
                    id: 'goToSymbol',
                    title: localize('gettingStarted.goToSymbol.title', "Navigate to symbols in a file"),
                    description: localize('gettingStarted.goToSymbol.description.interpolated', "The Go to Symbol command is useful for navigating between important landmarks in a document.\n{0}", Button(localize('openGoToSymbol', "Go to Symbol"), 'command:editor.action.goToSymbol')),
                    media: {
                        type: 'markdown', path: 'empty'
                    }
                },
                {
                    id: 'codeFolding',
                    title: localize('gettingStarted.codeFolding.title', "Use code folding to collapse blocks of code and focus on the code you're interested in."),
                    description: localize('gettingStarted.codeFolding.description.interpolated', "Fold or unfold a code section with the Toggle Fold command.\n{0}\n Fold or unfold recursively with the Toggle Fold Recursively Command\n{1}\n", Button(localize('toggleFold', "Toggle Fold"), 'command:editor.toggleFold'), Button(localize('toggleFoldRecursively', "Toggle Fold Recursively"), 'command:editor.toggleFoldRecursively')),
                    media: {
                        type: 'markdown', path: 'empty'
                    }
                },
                {
                    id: 'intellisense',
                    title: localize('gettingStarted.intellisense.title', "Use Intellisense to improve coding efficiency"),
                    description: localize('gettingStarted.intellisense.description.interpolated', "Intellisense suggestions can be opened with the Trigger Intellisense command.\n{0}\n Inline intellisense suggestions can be triggered with Trigger Inline Suggestion\n{1}\n Useful settings include editor.inlineCompletionsAccessibilityVerbose and editor.screenReaderAnnounceInlineSuggestion.", Button(localize('triggerIntellisense', "Trigger Intellisense"), 'command:editor.action.triggerSuggest'), Button(localize('triggerInlineSuggestion', 'Trigger Inline Suggestion'), 'command:editor.action.inlineSuggest.trigger')),
                    media: {
                        type: 'markdown', path: 'empty'
                    }
                },
                {
                    id: 'accessibilitySettings',
                    title: localize('gettingStarted.accessibilitySettings.title', "Configure accessibility settings"),
                    description: localize('gettingStarted.accessibilitySettings.description.interpolated', "Accessibility settings can be configured by running the Open Accessibility Settings command.\n{0}", Button(localize('openAccessibilitySettings', "Open Accessibility Settings"), 'command:workbench.action.openAccessibilitySettings')),
                    media: { type: 'markdown', path: 'empty' }
                },
                {
                    id: 'dictation',
                    title: localize('gettingStarted.dictation.title', "Use dictation to write code and text in the editor and terminal"),
                    description: localize('gettingStarted.dictation.description.interpolated', "Dictation allows you to write code and text using your voice. It can be activated with the Voice: Start Dictation in Editor command.\n{0}\n For dictation in the terminal, use the Voice: Start Dictation in Terminal and Voice: Stop Dictation in Terminal commands.\n{1}\n{2}", Button(localize('toggleDictation', "Voice: Start Dictation in Editor"), 'command:workbench.action.editorDictation.start'), Button(localize('terminalStartDictation', "Terminal: Start Dictation in Terminal"), 'command:workbench.action.terminal.startVoice'), Button(localize('terminalStopDictation', "Terminal: Stop Dictation in Terminal"), 'command:workbench.action.terminal.stopVoice')),
                    when: 'hasSpeechProvider',
                    media: { type: 'markdown', path: 'empty' }
                }
            ]
        }
    },
    {
        id: 'Beginner',
        isFeatured: false,
        title: localize('gettingStarted.beginner.title', "Learn the Fundamentals"),
        icon: beginnerIcon,
        description: localize('gettingStarted.beginner.description', "Get an overview of the most essential features"),
        walkthroughPageTitle: localize('gettingStarted.beginner.walkthroughPageTitle', 'Essential Features'),
        content: {
            type: 'steps',
            steps: [
                {
                    id: 'settingsAndSync',
                    title: localize('gettingStarted.settings.title', "Tune your settings"),
                    description: localize('gettingStarted.settingsAndSync.description.interpolated', "Customize every aspect of VS Code and [sync](command:workbench.userDataSync.actions.turnOn) customizations across devices.\n{0}", Button(localize('tweakSettings', "Open Settings"), 'command:toSide:workbench.action.openSettings')),
                    when: 'workspacePlatform != \'webworker\' && syncStatus != uninitialized',
                    completionEvents: ['onEvent:sync-enabled'],
                    media: {
                        type: 'svg', altText: 'VS Code Settings', path: 'settings.svg'
                    },
                },
                {
                    id: 'extensions',
                    title: localize('gettingStarted.extensions.title', "Code with extensions"),
                    description: localize('gettingStarted.extensions.description.interpolated', "Extensions are VS Code's power-ups. They range from handy productivity hacks, expanding out-of-the-box features, to adding completely new capabilities.\n{0}", Button(localize('browsePopular', "Browse Popular Extensions"), 'command:workbench.extensions.action.showPopularExtensions')),
                    when: 'workspacePlatform != \'webworker\'',
                    media: {
                        type: 'svg', altText: 'VS Code extension marketplace with featured language extensions', path: 'extensions.svg'
                    },
                },
                {
                    id: 'terminal',
                    title: localize('gettingStarted.terminal.title', "Built-in terminal"),
                    description: localize('gettingStarted.terminal.description.interpolated', "Quickly run shell commands and monitor build output, right next to your code.\n{0}", Button(localize('showTerminal', "Open Terminal"), 'command:workbench.action.terminal.toggleTerminal')),
                    when: 'workspacePlatform != \'webworker\' && remoteName != codespaces && !terminalIsOpen',
                    media: {
                        type: 'svg', altText: 'Integrated terminal running a few npm commands', path: 'terminal.svg'
                    },
                },
                {
                    id: 'debugging',
                    title: localize('gettingStarted.debug.title', "Watch your code in action"),
                    description: localize('gettingStarted.debug.description.interpolated', "Accelerate your edit, build, test, and debug loop by setting up a launch configuration.\n{0}", Button(localize('runProject', "Run your Project"), 'command:workbench.action.debug.selectandstart')),
                    when: 'workspacePlatform != \'webworker\' && workspaceFolderCount != 0',
                    media: {
                        type: 'svg', altText: 'Run and debug view.', path: 'debug.svg',
                    },
                },
                {
                    id: 'scmClone',
                    title: localize('gettingStarted.scm.title', "Track your code with Git"),
                    description: localize('gettingStarted.scmClone.description.interpolated', "Set up the built-in version control for your project to track your changes and collaborate with others.\n{0}", Button(localize('cloneRepo', "Clone Repository"), 'command:git.clone')),
                    when: 'config.git.enabled && !git.missing && workspaceFolderCount == 0',
                    media: {
                        type: 'svg', altText: 'Source Control view.', path: 'git.svg',
                    },
                },
                {
                    id: 'scmSetup',
                    title: localize('gettingStarted.scm.title', "Track your code with Git"),
                    description: localize('gettingStarted.scmSetup.description.interpolated', "Set up the built-in version control for your project to track your changes and collaborate with others.\n{0}", Button(localize('initRepo', "Initialize Git Repository"), 'command:git.init')),
                    when: 'config.git.enabled && !git.missing && workspaceFolderCount != 0 && gitOpenRepositoryCount == 0',
                    media: {
                        type: 'svg', altText: 'Source Control view.', path: 'git.svg',
                    },
                },
                {
                    id: 'scm',
                    title: localize('gettingStarted.scm.title', "Track your code with Git"),
                    description: localize('gettingStarted.scm.description.interpolated', "No more looking up Git commands! Git and GitHub workflows are seamlessly integrated.\n{0}", Button(localize('openSCM', "Open Source Control"), 'command:workbench.view.scm')),
                    when: 'config.git.enabled && !git.missing && workspaceFolderCount != 0 && gitOpenRepositoryCount != 0 && activeViewlet != \'workbench.view.scm\'',
                    media: {
                        type: 'svg', altText: 'Source Control view.', path: 'git.svg',
                    },
                },
                {
                    id: 'installGit',
                    title: localize('gettingStarted.installGit.title', "Install Git"),
                    description: localize({ key: 'gettingStarted.installGit.description.interpolated', comment: ['The placeholders are command link items should not be translated'] }, "Install Git to track changes in your projects.\n{0}\n{1}Reload window{2} after installation to complete Git setup.", Button(localize('installGit', "Install Git"), 'https://aka.ms/vscode-install-git'), '[', '](command:workbench.action.reloadWindow)'),
                    when: 'git.missing',
                    media: {
                        type: 'svg', altText: 'Install Git.', path: 'git.svg',
                    },
                    completionEvents: [
                        'onContext:git.state == initialized'
                    ]
                },
                {
                    id: 'tasks',
                    title: localize('gettingStarted.tasks.title', "Automate your project tasks"),
                    when: 'workspaceFolderCount != 0 && workspacePlatform != \'webworker\'',
                    description: localize('gettingStarted.tasks.description.interpolated', "Create tasks for your common workflows and enjoy the integrated experience of running scripts and automatically checking results.\n{0}", Button(localize('runTasks', "Run Auto-detected Tasks"), 'command:workbench.action.tasks.runTask')),
                    media: {
                        type: 'svg', altText: 'Task runner.', path: 'runTask.svg',
                    },
                },
                {
                    id: 'shortcuts',
                    title: localize('gettingStarted.shortcuts.title', "Customize your shortcuts"),
                    description: localize('gettingStarted.shortcuts.description.interpolated', "Once you have discovered your favorite commands, create custom keyboard shortcuts for instant access.\n{0}", Button(localize('keyboardShortcuts', "Keyboard Shortcuts"), 'command:toSide:workbench.action.openGlobalKeybindings')),
                    media: {
                        type: 'svg', altText: 'Interactive shortcuts.', path: 'shortcuts.svg',
                    }
                },
                {
                    id: 'workspaceTrust',
                    title: localize('gettingStarted.workspaceTrust.title', "Safely browse and edit code"),
                    description: localize('gettingStarted.workspaceTrust.description.interpolated', "{0} lets you decide whether your project folders should **allow or restrict** automatic code execution __(required for extensions, debugging, etc)__.\nOpening a file/folder will prompt to grant trust. You can always {1} later.", Button(localize('workspaceTrust', "Workspace Trust"), 'https://code.visualstudio.com/docs/editor/workspace-trust'), Button(localize('enableTrust', "enable trust"), 'command:toSide:workbench.trust.manage')),
                    when: 'workspacePlatform != \'webworker\' && !isWorkspaceTrusted && workspaceFolderCount == 0',
                    media: {
                        type: 'svg', altText: 'Workspace Trust editor in Restricted mode and a primary button for switching to Trusted mode.', path: 'workspaceTrust.svg'
                    },
                },
            ]
        }
    },
    {
        id: 'notebooks',
        title: localize('gettingStarted.notebook.title', "Customize Notebooks"),
        description: '',
        icon: setupIcon,
        isFeatured: false,
        when: `config.${NotebookSetting.openGettingStarted} && userHasOpenedNotebook`,
        walkthroughPageTitle: localize('gettingStarted.notebook.walkthroughPageTitle', 'Notebooks'),
        content: {
            type: 'steps',
            steps: [
                {
                    completionEvents: ['onCommand:notebook.setProfile'],
                    id: 'notebookProfile',
                    title: localize('gettingStarted.notebookProfile.title', "Select the layout for your notebooks"),
                    description: localize('gettingStarted.notebookProfile.description', "Get notebooks to feel just the way you prefer"),
                    when: 'userHasOpenedNotebook',
                    media: {
                        type: 'markdown', path: 'notebookProfile'
                    }
                },
            ]
        }
    }
];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0dGluZ1N0YXJ0ZWRDb250ZW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZUdldHRpbmdTdGFydGVkL2NvbW1vbi9nZXR0aW5nU3RhcnRlZENvbnRlbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxrQkFBa0IsTUFBTSx5QkFBeUIsQ0FBQztBQUN6RCxPQUFPLHVCQUF1QixNQUFNLCtCQUErQixDQUFDO0FBQ3BFLE9BQU8sc0JBQXNCLE1BQU0sNEJBQTRCLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUU5RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDakYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRWhILE9BQU8sT0FBTyxNQUFNLGdEQUFnRCxDQUFDO0FBTXJFLE1BQU0sV0FBVyxHQUFHO0lBQ25CLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxnQkFBZ0IsSUFBSSxFQUFFO0lBQ2xFLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxpQkFBaUIsSUFBSSxFQUFFO0lBQ3BFLFFBQVEsRUFBRSxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsUUFBUSxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFO0lBQ3pFLG9CQUFvQixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxvQkFBb0IsSUFBSSxFQUFFO0lBQzFFLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxnQkFB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