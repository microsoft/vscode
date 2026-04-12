/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import Severity from '../../../../base/common/severity.js';
import { EXTENSION_IDENTIFIER_PATTERN } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { Extensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EXTENSION_CATEGORIES, ExtensionIdentifierSet } from '../../../../platform/extensions/common/extensions.js';
import { productSchemaId } from '../../../../platform/product/common/productService.js';
import { ImplicitActivationEvents } from '../../../../platform/extensionManagement/common/implicitActivationEvents.js';
import { allApiProposals } from '../../../../platform/extensions/common/extensionsApiProposals.js';
const schemaRegistry = Registry.as(Extensions.JSONContribution);
export class ExtensionMessageCollector {
    constructor(messageHandler, extension, extensionPointId) {
        this._messageHandler = messageHandler;
        this._extension = extension;
        this._extensionPointId = extensionPointId;
    }
    _msg(type, message) {
        this._messageHandler({
            type: type,
            message: message,
            extensionId: this._extension.identifier,
            extensionPointId: this._extensionPointId
        });
    }
    error(message) {
        this._msg(Severity.Error, message);
    }
    warn(message) {
        this._msg(Severity.Warning, message);
    }
    info(message) {
        this._msg(Severity.Info, message);
    }
}
export class ExtensionPointUserDelta {
    static _toSet(arr) {
        const result = new ExtensionIdentifierSet();
        for (let i = 0, len = arr.length; i < len; i++) {
            result.add(arr[i].description.identifier);
        }
        return result;
    }
    static compute(previous, current) {
        if (!previous || !previous.length) {
            return new ExtensionPointUserDelta(current, []);
        }
        if (!current || !current.length) {
            return new ExtensionPointUserDelta([], previous);
        }
        const previousSet = this._toSet(previous);
        const currentSet = this._toSet(current);
        const added = current.filter(user => !previousSet.has(user.description.identifier));
        const removed = previous.filter(user => !currentSet.has(user.description.identifier));
        return new ExtensionPointUserDelta(added, removed);
    }
    constructor(added, removed) {
        this.added = added;
        this.removed = removed;
    }
}
export class ExtensionPoint {
    constructor(name, defaultExtensionKind, canHandleResolver) {
        this.name = name;
        this.defaultExtensionKind = defaultExtensionKind;
        this.canHandleResolver = canHandleResolver;
        this._handler = null;
        this._users = null;
        this._delta = null;
    }
    setHandler(handler) {
        if (this._handler !== null) {
            throw new Error('Handler already set!');
        }
        this._handler = handler;
        this._handle();
        return {
            dispose: () => {
                this._handler = null;
            }
        };
    }
    acceptUsers(users) {
        this._delta = ExtensionPointUserDelta.compute(this._users, users);
        this._users = users;
        this._handle();
    }
    _handle() {
        if (this._handler === null || this._users === null || this._delta === null) {
            return;
        }
        try {
            this._handler(this._users, this._delta);
        }
        catch (err) {
            onUnexpectedError(err);
        }
    }
}
const extensionKindSchema = {
    type: 'string',
    enum: [
        'ui',
        'workspace'
    ],
    enumDescriptions: [
        nls.localize('ui', "UI extension kind. In a remote window, such extensions are enabled only when available on the local machine."),
        nls.localize('workspace', "Workspace extension kind. In a remote window, such extensions are enabled only when available on the remote."),
    ],
};
const schemaId = 'vscode://schemas/vscode-extensions';
export const schema = {
    properties: {
        engines: {
            type: 'object',
            description: nls.localize('vscode.extension.engines', "Engine compatibility."),
            properties: {
                'vscode': {
                    type: 'string',
                    description: nls.localize('vscode.extension.engines.vscode', 'For VS Code extensions, specifies the VS Code version that the extension is compatible with. Cannot be *. For example: ^1.105.0 indicates compatibility with a minimum VS Code version of 1.105.0.'),
                    default: '^1.105.0',
                }
            }
        },
        publisher: {
            description: nls.localize('vscode.extension.publisher', 'The publisher of the VS Code extension.'),
            type: 'string'
        },
        displayName: {
            description: nls.localize('vscode.extension.displayName', 'The display name for the extension used in the VS Code gallery.'),
            type: 'string'
        },
        categories: {
            description: nls.localize('vscode.extension.categories', 'The categories used by the VS Code gallery to categorize the extension.'),
            type: 'array',
            uniqueItems: true,
            items: {
                oneOf: [{
                        type: 'string',
                        enum: EXTENSION_CATEGORIES,
                    },
                    {
                        type: 'string',
                        const: 'Languages',
                        deprecationMessage: nls.localize('vscode.extension.category.languages.deprecated', 'Use \'Programming  Languages\' instead'),
                    }]
            }
        },
        galleryBanner: {
            type: 'object',
            description: nls.localize('vscode.extension.galleryBanner', 'Banner used in the VS Code marketplace.'),
            properties: {
                color: {
                    description: nls.localize('vscode.extension.galleryBanner.color', 'The banner color on the VS Code marketplace page header.'),
                    type: 'string'
                },
                theme: {
                    description: nls.localize('vscode.extension.galleryBanner.theme', 'The color theme for the font used in the banner.'),
                    type: 'string',
                    enum: ['dark', 'light']
                }
            }
        },
        contributes: {
            description: nls.localize('vscode.extension.contributes', 'All contributions of the VS Code extension represented by this package.'),
            type: 'object',
            // eslint-disable-next-line local/code-no-any-casts
            properties: {
            // extensions will fill in
            },
            default: {}
        },
        preview: {
            type: 'boolean',
            description: nls.localize('vscode.extension.preview', 'Sets the extension to be flagged as a Preview in the Marketplace.'),
        },
        enableProposedApi: {
            type: 'boolean',
            deprecationMessage: nls.localize('vscode.extension.enableProposedApi.deprecated', 'Use `enabledApiProposals` instead.'),
        },
        enabledApiProposals: {
            markdownDescription: nls.localize('vscode.extension.enabledApiProposals', 'Enable API proposals to try them out. Only valid **during development**. Extensions **cannot be published** with this property. For more details visit: https://code.visualstudio.com/api/advanced-topics/using-proposed-api'),
            type: 'array',
            uniqueItems: true,
            items: {
                type: 'string',
                enum: Object.keys(allApiProposals).map(proposalName => proposalName),
                markdownEnumDescriptions: Object.values(allApiProposals).map(value => value.proposal)
            }
        },
        api: {
            markdownDescription: nls.localize('vscode.extension.api', 'Describe the API provided by this extension. For more details visit: https://code.visualstudio.com/api/advanced-topics/remote-extensions#handling-dependencies-with-remote-extensions'),
            type: 'string',
            enum: ['none'],
            enumDescriptions: [
                nls.localize('vscode.extension.api.none', "Give up entirely the ability to export any APIs. This allows other extensions that depend on this extension to run in a separate extension host process or in a remote machine.")
            ]
        },
        activationEvents: {
            description: nls.localize('vscode.extension.activationEvents', 'Activation events for the VS Code extension.'),
            type: 'array',
            items: {
                type: 'string',
                defaultSnippets: [
                    {
                        label: 'onWebviewPanel',
                        description: nls.localize('vscode.extension.activationEvents.onWebviewPanel', 'An activation event emitted when a webview is loaded of a certain viewType'),
                        body: 'onWebviewPanel:viewType'
                    },
                    {
                        label: 'onLanguage',
                        description: nls.localize('vscode.extension.activationEvents.onLanguage', 'An activation event emitted whenever a file that resolves to the specified language gets opened.'),
                        body: 'onLanguage:${1:languageId}'
                    },
                    {
                        label: 'onCommand',
                        description: nls.localize('vscode.extension.activationEvents.onCommand', 'An activation event emitted whenever the specified command gets invoked.'),
                        body: 'onCommand:${2:commandId}'
                    },
                    {
                        label: 'onDebug',
                        description: nls.localize('vscode.extension.activationEvents.onDebug', 'An activation event emitted whenever a user is about to start debugging or about to setup debug configurations.'),
                        body: 'onDebug'
                    },
                    {
                        label: 'onDebugInitialConfigurations',
                        description: nls.localize('vscode.extension.activationEvents.onDebugInitialConfigurations', 'An activation event emitted whenever a "launch.json" needs to be created (and all provideDebugConfigurations methods need to be called).'),
                        body: 'onDebugInitialConfigurations'
                    },
                    {
                        label: 'onDebugDynamicConfigurations',
                        description: nls.localize('vscode.extension.activationEvents.onDebugDynamicConfigurations', 'An activation event emitted whenever a list of all debug configurations needs to be created (and all provideDebugConfigurations methods for the "dynamic" scope need to be called).'),
                        body: 'onDebugDynamicConfigurations'
                    },
                    {
                        label: 'onDebugResolve',
                        description: nls.localize('vscode.extension.activationEvents.onDebugResolve', 'An activation event emitted whenever a debug session with the specific type is about to be launched (and a corresponding resolveDebugConfiguration method needs to be called).'),
                        body: 'onDebugResolve:${6:type}'
                    },
                    {
                        label: 'onDebugAdapterProtocolTracker',
                        description: nls.localize('vscode.extension.activationEvents.onDebugAdapterProtocolTracker', 'An activation event emitted whenever a debug session with the specific type is about to be launched and a debug protocol tracker might be needed.'),
                        body: 'onDebugAdapterProtocolTracker:${6:type}'
                    },
                    {
                        label: 'workspaceContains',
                        description: nls.localize('vscode.extension.activationEvents.workspaceContains', 'An activation event emitted whenever a folder is opened that contains at least a file matching the specified glob pattern.'),
                        body: 'workspaceContains:${4:filePattern}'
                    },
                    {
                        label: 'onStartupFinished',
                        description: nls.localize('vscode.extension.activationEvents.onStartupFinished', 'An activation event emitted after the start-up finished (after all `*` activated extensions have finished activating).'),
                        body: 'onStartupFinished'
                    },
                    {
                        label: 'onTaskType',
                        description: nls.localize('vscode.extension.activationEvents.onTaskType', 'An activation event emitted whenever tasks of a certain type need to be listed or resolved.'),
                        body: 'onTaskType:${1:taskType}'
                    },
                    {
                        label: 'onFileSystem',
                        description: nls.localize('vscode.extension.activationEvents.onFileSystem', 'An activation event emitted whenever a file or folder is accessed with the given scheme.'),
                        body: 'onFileSystem:${1:scheme}'
                    },
                    {
                        label: 'onEditSession',
                        description: nls.localize('vscode.extension.activationEvents.onEditSession', 'An activation event emitted whenever an edit session is accessed with the given scheme.'),
                        body: 'onEditSession:${1:scheme}'
                    },
                    {
                        label: 'onSearch',
                        description: nls.localize('vscode.extension.activationEvents.onSearch', 'An activation event emitted whenever a search is started in the folder with the given scheme.'),
                        body: 'onSearch:${7:scheme}'
                    },
                    {
                        label: 'onView',
                        body: 'onView:${5:viewId}',
                        description: nls.localize('vscode.extension.activationEvents.onView', 'An activation event emitted whenever the specified view is expanded.'),
                    },
                    {
                        label: 'onUri',
                        body: 'onUri',
                        description: nls.localize('vscode.extension.activationEvents.onUri', 'An activation event emitted whenever a system-wide Uri directed towards this extension is open.'),
                    },
                    {
                        label: 'onOpenExternalUri',
                        body: 'onOpenExternalUri',
                        description: nls.localize('vscode.extension.activationEvents.onOpenExternalUri', 'An activation event emitted whenever a external uri (such as an http or https link) is being opened.'),
                    },
                    {
                        label: 'onCustomEditor',
                        body: 'onCustomEditor:${9:viewType}',
                        description: nls.localize('vscode.extension.activationEvents.onCustomEditor', 'An activation event emitted whenever the specified custom editor becomes visible.'),
                    },
                    {
                        label: 'onNotebook',
                        body: 'onNotebook:${1:type}',
                        description: nls.localize('vscode.extension.activationEvents.onNotebook', 'An activation event emitted whenever the specified notebook document is opened.'),
                    },
                    {
                        label: 'onAuthenticationRequest',
                        body: 'onAuthenticationRequest:${11:authenticationProviderId}',
                        description: nls.localize('vscode.extension.activationEvents.onAuthenticationRequest', 'An activation event emitted whenever sessions are requested from the specified authentication provider.')
                    },
                    {
                        label: 'onRenderer',
                        description: nls.localize('vscode.extension.activationEvents.onRenderer', 'An activation event emitted whenever a notebook output renderer is used.'),
                        body: 'onRenderer:${11:rendererId}'
                    },
                    {
                        label: 'onTerminalProfile',
                        body: 'onTerminalProfile:${1:terminalId}',
                        description: nls.localize('vscode.extension.activationEvents.onTerminalProfile', 'An activation event emitted when a specific terminal profile is launched.'),
                    },
                    {
                        label: 'onTerminalQuickFixRequest',
                        body: 'onTerminalQuickFixRequest:${1:quickFixId}',
                        description: nls.localize('vscode.extension.activationEvents.onTerminalQuickFixRequest', 'An activation event emitted when a command matches the selector associated with this ID'),
                    },
                    {
                        label: 'onWalkthrough',
                        body: 'onWalkthrough:${1:walkthroughID}',
                        description: nls.localize('vscode.extension.activationEvents.onWalkthrough', 'An activation event emitted when a specified walkthrough is opened.'),
                    },
                    {
                        label: 'onIssueReporterOpened',
                        body: 'onIssueReporterOpened',
                        description: nls.localize('vscode.extension.activationEvents.onIssueReporterOpened', 'An activation event emitted when the issue reporter is opened.'),
                    },
                    {
                        label: 'onChatParticipant',
                        body: 'onChatParticipant:${1:participantId}',
                        description: nls.localize('vscode.extension.activationEvents.onChatParticipant', 'An activation event emitted when the specified chat participant is invoked.'),
                    },
                    {
                        label: 'onChatContextProvider',
                        body: 'onChatContextProvider:${1:contextProviderId}',
                        description: nls.localize('vscode.extension.activationEvents.onChatContextProvider', 'An activation event emitted when the specified chat context provider is invoked.'),
                    },
                    {
                        label: 'onLanguageModelChatProvider',
                        body: 'onLanguageModelChatProvider:${1:vendor}',
                        description: nls.localize('vscode.extension.activationEvents.onLanguageModelChatProvider', 'An activation event emitted when a chat model provider for the given vendor is requested.'),
                    },
                    {
                        label: 'onLanguageModelTool',
                        body: 'onLanguageModelTool:${1:toolId}',
                        description: nls.localize('vscode.extension.activationEvents.onLanguageModelTool', 'An activation event emitted when the specified language model tool is invoked.'),
                    },
                    {
                        label: 'onTerminal',
                        body: 'onTerminal:{1:shellType}',
                        description: nls.localize('vscode.extension.activationEvents.onTerminal', 'An activation event emitted when a terminal of the given shell type is opened.'),
                    },
                    {
                        label: 'onTerminalShellIntegration',
                        body: 'onTerminalShellIntegration:${1:shellType}',
                        description: nls.localize('vscode.extension.activationEvents.onTerminalShellIntegration', 'An activation event emitted when terminal shell integration is activated for the given shell type.'),
                    },
                    {
                        label: 'onMcpCollection',
                        description: nls.localize('vscode.extension.activationEvents.onMcpCollection', 'An activation event emitted whenever a tool from the MCP server is requested.'),
                        body: 'onMcpCollection:${2:collectionId}',
                    },
                    {
                        label: '*',
                        description: nls.localize('vscode.extension.activationEvents.star', 'An activation event emitted on VS Code startup. To ensure a great end user experience, please use this activation event in your extension only when no other activation events combination works in your use-case.'),
                        body: '*'
                    }
                ],
            }
        },
        badges: {
            type: 'array',
            description: nls.localize('vscode.extension.badges', 'Array of badges to display in the sidebar of the Marketplace\'s extension page.'),
            items: {
                type: 'object',
                required: ['url', 'href', 'description'],
                properties: {
                    url: {
                        type: 'string',
                        description: nls.localize('vscode.extension.badges.url', 'Badge image URL.')
                    },
                    href: {
                        type: 'string',
                        description: nls.localize('vscode.extension.badges.href', 'Badge link.')
                    },
                    description: {
                        type: 'string',
                        description: nls.localize('vscode.extension.badges.description', 'Badge description.')
                    }
                }
            }
        },
        markdown: {
            type: 'string',
            description: nls.localize('vscode.extension.markdown', "Controls the Markdown rendering engine used in the Marketplace. Either github (default) or standard."),
            enum: ['github', 'standard'],
            default: 'github'
        },
        qna: {
            default: 'marketplace',
            description: nls.localize('vscode.extension.qna', "Controls the Q&A link in the Marketplace. Set to marketplace to enable the default Marketplace Q & A site. Set to a string to provide the URL of a custom Q & A site. Set to false to disable Q & A altogether."),
            anyOf: [
                {
                    type: ['string', 'boolean'],
                    enum: ['marketplace', false]
                },
                {
                    type: 'string'
                }
            ]
        },
        extensionDependencies: {
            description: nls.localize('vscode.extension.extensionDependencies', 'Dependencies to other extensions. The identifier of an extension is always ${publisher}.${name}. For example: vscode.csharp.'),
            type: 'array',
            uniqueItems: true,
            items: {
                type: 'string',
                pattern: EXTENSION_IDENTIFIER_PATTERN
            }
        },
        extensionAffinity: {
            description: nls.localize('vscode.extension.extensionAffinity', 'Extensions that this extension should be colocated with in the same extension host process if possible. The identifier of an extension is always ${publisher}.${name}. For example: vscode.git.'),
            type: 'array',
            uniqueItems: true,
            items: {
                type: 'string',
                pattern: EXTENSION_IDENTIFIER_PATTERN
            }
        },
        extensionPack: {
            description: nls.localize('vscode.extension.contributes.extensionPack', "A set of extensions that can be installed together. The identifier of an extension is always ${publisher}.${name}. For example: vscode.csharp."),
            type: 'array',
            uniqueItems: true,
            items: {
                type: 'string',
                pattern: EXTENSION_IDENTIFIER_PATTERN
            }
        },
        extensionKind: {
            description: nls.localize('extensionKind', "Define the kind of an extension. `ui` extensions are installed and run on the local machine while `workspace` extensions run on the remote."),
            type: 'array',
            items: extensionKindSchema,
            default: ['workspace'],
            defaultSnippets: [
                {
                    body: ['ui'],
                    description: nls.localize('extensionKind.ui', "Define an extension which can run only on the local machine when connected to remote window.")
                },
                {
                    body: ['workspace'],
                    description: nls.localize('extensionKind.workspace', "Define an extension which can run only on the remote machine when connected remote window.")
                },
                {
                    body: ['ui', 'workspace'],
                    description: nls.localize('extensionKind.ui-workspace', "Define an extension which can run on either side, with a preference towards running on the local machine.")
                },
                {
                    body: ['workspace', 'ui'],
                    description: nls.localize('extensionKind.workspace-ui', "Define an extension which can run on either side, with a preference towards running on the remote machine.")
                },
                {
                    body: [],
                    description: nls.localize('extensionKind.empty', "Define an extension which cannot run in a remote context, neither on the local, nor on the remote machine.")
                }
            ]
        },
        capabilities: {
            description: nls.localize('vscode.extension.capabilities', "Declare the set of supported capabilities by the extension."),
            type: 'object',
            properties: {
                virtualWorkspaces: {
                    description: nls.localize('vscode.extension.capabilities.virtualWorkspaces', "Declares whether the extension should be enabled in virtual workspaces. A virtual workspace is a workspace which is not backed by any on-disk resources. When false, this extension will be automatically disabled in virtual workspaces. Default is true."),
                    type: ['boolean', 'object'],
                    defaultSnippets: [
                        { label: 'limited', body: { supported: '${1:limited}', description: '${2}' } },
                        { label: 'false', body: { supported: false, description: '${2}' } },
                    ],
                    default: true.valueOf,
                    properties: {
                        supported: {
                            markdownDescription: nls.localize('vscode.extension.capabilities.virtualWorkspaces.supported', "Declares the level of support for virtual workspaces by the extension."),
                            type: ['string', 'boolean'],
                            enum: ['limited', true, false],
                            enumDescriptions: [
                                nls.localize('vscode.extension.capabilities.virtualWorkspaces.supported.limited', "The extension will be enabled in virtual workspaces with some functionality disabled."),
                                nls.localize('vscode.extension.capabilities.virtualWorkspaces.supported.true', "The extension will be enabled in virtual workspaces with all functionality enabled."),
                                nls.localize('vscode.extension.capabilities.virtualWorkspaces.supported.false', "The extension will not be enabled in virtual workspaces."),
                            ]
                        },
                        description: {
                            type: 'string',
                            markdownDescription: nls.localize('vscode.extension.capabilities.virtualWorkspaces.description', "A description of how virtual workspaces affects the extensions behavior and why it is needed. This only applies when `supported` is not `true`."),
                        }
                    }
                },
                untrustedWorkspaces: {
                    description: nls.localize('vscode.extension.capabilities.untrustedWorkspaces', 'Declares how the extension should be handled in untrusted workspaces.'),
                    type: 'object',
                    required: ['supported'],
                    defaultSnippets: [
                        { body: { supported: '${1:limited}', description: '${2}' } },
                    ],
                    properties: {
                        supported: {
                            markdownDescription: nls.localize('vscode.extension.capabilities.untrustedWorkspaces.supported', "Declares the level of support for untrusted workspaces by the extension."),
                            type: ['string', 'boolean'],
                            enum: ['limited', true, false],
                            enumDescriptions: [
                                nls.localize('vscode.extension.capabilities.untrustedWorkspaces.supported.limited', "The extension will be enabled in untrusted workspaces with some functionality disabled."),
                                nls.localize('vscode.extension.capabilities.untrustedWorkspaces.supported.true', "The extension will be enabled in untrusted workspaces with all functionality enabled."),
                                nls.localize('vscode.extension.capabilities.untrustedWorkspaces.supported.false', "The extension will not be enabled in untrusted workspaces."),
                            ]
                        },
                        restrictedConfigurations: {
                            description: nls.localize('vscode.extension.capabilities.untrustedWorkspaces.restrictedConfigurations', "A list of configuration keys contributed by the extension that should not use workspace values in untrusted workspaces."),
                            type: 'array',
                            items: {
                                type: 'string'
                            }
                        },
                        description: {
                            type: 'string',
                            markdownDescription: nls.localize('vscode.extension.capabilities.untrustedWorkspaces.description', "A description of how workspace trust affects the extensions behavior and why it is needed. This only applies when `supported` is not `true`."),
                        }
                    }
                }
            }
        },
        sponsor: {
            description: nls.localize('vscode.extension.contributes.sponsor', "Specify the location from where users can sponsor your extension."),
            type: 'object',
            defaultSnippets: [
                { body: { url: '${1:https:}' } },
            ],
            properties: {
                'url': {
                    description: nls.localize('vscode.extension.contributes.sponsor.url', "URL from where users can sponsor your extension. It must be a valid URL with a HTTP or HTTPS protocol. Example value: https://github.com/sponsors/nvaccess"),
                    type: 'string',
                }
            }
        },
        scripts: {
            type: 'object',
            properties: {
                'vscode:prepublish': {
                    description: nls.localize('vscode.extension.scripts.prepublish', 'Script executed before the package is published as a VS Code extension.'),
                    type: 'string'
                },
                'vscode:uninstall': {
                    description: nls.localize('vscode.extension.scripts.uninstall', 'Uninstall hook for VS Code extension. Script that gets executed when the extension is completely uninstalled from VS Code which is when VS Code is restarted (shutdown and start) after the extension is uninstalled. Only Node scripts are supported.'),
                    type: 'string'
                }
            }
        },
        icon: {
            type: 'string',
            description: nls.localize('vscode.extension.icon', 'The path to a 128x128 pixel icon.')
        },
        l10n: {
            type: 'string',
            description: nls.localize({
                key: 'vscode.extension.l10n',
                comment: [
                    '{Locked="bundle.l10n._locale_.json"}',
                    '{Locked="vscode.l10n API"}'
                ]
            }, 'The relative path to a folder containing localization (bundle.l10n.*.json) files. Must be specified if you are using the vscode.l10n API.')
        },
        pricing: {
            type: 'string',
            markdownDescription: nls.localize('vscode.extension.pricing', 'The pricing information for the extension. Can be Free (default) or Trial. For more details visit: https://code.visualstudio.com/api/working-with-extensions/publishing-extension#extension-pricing-label'),
            enum: ['Free', 'Trial'],
            default: 'Free'
        }
    }
};
export class ExtensionsRegistryImpl {
    constructor() {
        this._extensionPoints = new Map();
    }
    registerExtensionPoint(desc) {
        if (this._extensionPoints.has(desc.extensionPoint)) {
            throw new Error('Duplicate extension point: ' + desc.extensionPoint);
        }
        const result = new ExtensionPoint(desc.extensionPoint, desc.defaultExtensionKind, desc.canHandleResolver);
        this._extensionPoints.set(desc.extensionPoint, result);
        if (desc.activationEventsGenerator) {
            ImplicitActivationEvents.register(desc.extensionPoint, desc.activationEventsGenerator);
        }
        schema.properties['contributes'].properties[desc.extensionPoint] = desc.jsonSchema;
        schemaRegistry.registerSchema(schemaId, schema);
        return result;
    }
    getExtensionPoints() {
        return Array.from(this._extensionPoints.values());
    }
}
const PRExtensions = {
    ExtensionsRegistry: 'ExtensionsRegistry'
};
Registry.add(PRExtensions.ExtensionsRegistry, new ExtensionsRegistryImpl());
export const ExtensionsRegistry = Registry.as(PRExtensions.ExtensionsRegistry);
schemaRegistry.registerSchema(schemaId, schema);
schemaRegistry.registerSchema(productSchemaId, {
    properties: {
        extensionEnabledApiProposals: {
            description: nls.localize('product.extensionEnabledApiProposals', "API proposals that the respective extensions can freely use."),
            type: 'object',
            properties: {},
            additionalProperties: {
                anyOf: [{
                        type: 'array',
                        uniqueItems: true,
                        items: {
                            type: 'string',
                            enum: Object.keys(allApiProposals),
                            markdownEnumDescriptions: Object.values(allApiProposals).map(value => value.proposal)
                        }
                    }]
            }
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXRFLE9BQU8sUUFBUSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNELE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBQ3RILE9BQU8sRUFBRSxVQUFVLEVBQTZCLE1BQU0scUVBQXFFLENBQUM7QUFDNUgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRTVFLE9BQU8sRUFBeUIsb0JBQW9CLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUUzSSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLHdCQUF3QixFQUE4QixNQUFNLDZFQUE2RSxDQUFDO0FBRW5KLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUVuRyxNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUE0QixVQUFVLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUUzRixNQUFNLE9BQU8seUJBQXlCO0lBTXJDLFlBQ0MsY0FBdUMsRUFDdkMsU0FBZ0MsRUFDaEMsZ0JBQXdCO1FBRXhCLElBQUksQ0FBQyxlQUFlLEdBQUcsY0FBYyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDO1FBQzVCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxnQkFBZ0IsQ0FBQztJQUMz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