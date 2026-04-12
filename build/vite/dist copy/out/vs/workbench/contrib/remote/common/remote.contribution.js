/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { isWeb, OS } from '../../../../base/common/platform.js';
import { Schemas } from '../../../../base/common/network.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { localize, localize2 } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { PersistentConnection } from '../../../../platform/remote/common/remoteAgentConnection.js';
import { IDownloadService } from '../../../../platform/download/common/download.js';
import { DownloadServiceChannel } from '../../../../platform/download/common/downloadIpc.js';
import { RemoteLoggerChannelClient } from '../../../../platform/log/common/logIpc.js';
import { REMOTE_DEFAULT_IF_LOCAL_EXTENSIONS } from '../../../../platform/remote/common/remote.js';
import product from '../../../../platform/product/common/product.js';
const EXTENSION_IDENTIFIER_PATTERN = '([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$';
let LabelContribution = class LabelContribution {
    static { this.ID = 'workbench.contrib.remoteLabel'; }
    constructor(labelService, remoteAgentService) {
        this.labelService = labelService;
        this.remoteAgentService = remoteAgentService;
        this.registerFormatters();
    }
    registerFormatters() {
        this.remoteAgentService.getEnvironment().then(remoteEnvironment => {
            const os = remoteEnvironment?.os || OS;
            const formatting = {
                label: '${path}',
                separator: os === 1 /* OperatingSystem.Windows */ ? '\\' : '/',
                tildify: os !== 1 /* OperatingSystem.Windows */,
                normalizeDriveLetter: os === 1 /* OperatingSystem.Windows */,
                workspaceSuffix: isWeb ? undefined : Schemas.vscodeRemote
            };
            this.labelService.registerFormatter({
                scheme: Schemas.vscodeRemote,
                formatting
            });
            if (remoteEnvironment) {
                this.labelService.registerFormatter({
                    scheme: Schemas.vscodeUserData,
                    formatting
                });
            }
        });
    }
};
LabelContribution = __decorate([
    __param(0, ILabelService),
    __param(1, IRemoteAgentService)
], LabelContribution);
export { LabelContribution };
let RemoteChannelsContribution = class RemoteChannelsContribution extends Disposable {
    constructor(remoteAgentService, downloadService, loggerService) {
        super();
        const connection = remoteAgentService.getConnection();
        if (connection) {
            connection.registerChannel('download', new DownloadServiceChannel(downloadService));
            connection.withChannel('logger', async (channel) => this._register(new RemoteLoggerChannelClient(loggerService, channel)));
        }
    }
};
RemoteChannelsContribution = __decorate([
    __param(0, IRemoteAgentService),
    __param(1, IDownloadService),
    __param(2, ILoggerService)
], RemoteChannelsContribution);
let RemoteInvalidWorkspaceDetector = class RemoteInvalidWorkspaceDetector extends Disposable {
    static { this.ID = 'workbench.contrib.remoteInvalidWorkspaceDetector'; }
    constructor(fileService, dialogService, environmentService, contextService, fileDialogService, remoteAgentService) {
        super();
        this.fileService = fileService;
        this.dialogService = dialogService;
        this.environmentService = environmentService;
        this.contextService = contextService;
        this.fileDialogService = fileDialogService;
        // When connected to a remote workspace, we currently cannot
        // validate that the workspace exists before actually opening
        // it. As such, we need to check on that after startup and guide
        // the user to a valid workspace.
        // (see https://github.com/microsoft/vscode/issues/133872)
        if (this.environmentService.remoteAuthority) {
            remoteAgentService.getEnvironment().then(remoteEnv => {
                if (remoteEnv) {
                    // we use the presence of `remoteEnv` to figure out
                    // if we got a healthy remote connection
                    // (see https://github.com/microsoft/vscode/issues/135331)
                    this.validateRemoteWorkspace();
                }
            });
        }
    }
    async validateRemoteWorkspace() {
        const workspace = this.contextService.getWorkspace();
        const workspaceUriToStat = workspace.configuration ?? workspace.folders.at(0)?.uri;
        if (!workspaceUriToStat) {
            return; // only when in workspace
        }
        const exists = await this.fileService.exists(workspaceUriToStat);
        if (exists) {
            return; // all good!
        }
        const res = await this.dialogService.confirm({
            type: 'warning',
            message: localize('invalidWorkspaceMessage', "Workspace does not exist"),
            detail: localize('invalidWorkspaceDetail', "Please select another workspace to open."),
            primaryButton: localize({ key: 'invalidWorkspacePrimary', comment: ['&& denotes a mnemonic'] }, "&&Open Workspace...")
        });
        if (res.confirmed) {
            // Pick Workspace
            if (workspace.configuration) {
                return this.fileDialogService.pickWorkspaceAndOpen({});
            }
            // Pick Folder
            return this.fileDialogService.pickFolderAndOpen({});
        }
    }
};
RemoteInvalidWorkspaceDetector = __decorate([
    __param(0, IFileService),
    __param(1, IDialogService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, IWorkspaceContextService),
    __param(4, IFileDialogService),
    __param(5, IRemoteAgentService)
], RemoteInvalidWorkspaceDetector);
const workbenchContributionsRegistry = Registry.as(WorkbenchExtensions.Workbench);
registerWorkbenchContribution2(LabelContribution.ID, LabelContribution, 1 /* WorkbenchPhase.BlockStartup */);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteChannelsContribution, 3 /* LifecyclePhase.Restored */);
registerWorkbenchContribution2(RemoteInvalidWorkspaceDetector.ID, RemoteInvalidWorkspaceDetector, 1 /* WorkbenchPhase.BlockStartup */);
const enableDiagnostics = true;
if (enableDiagnostics) {
    class TriggerReconnectAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.triggerReconnect',
                title: localize2('triggerReconnect', 'Connection: Trigger Reconnect'),
                category: Categories.Developer,
                f1: true,
            });
        }
        async run(accessor) {
            PersistentConnection.debugTriggerReconnection();
        }
    }
    class PauseSocketWriting extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.pauseSocketWriting',
                title: localize2('pauseSocketWriting', 'Connection: Pause socket writing'),
                category: Categories.Developer,
                f1: true,
            });
        }
        async run(accessor) {
            PersistentConnection.debugPauseSocketWriting();
        }
    }
    registerAction2(TriggerReconnectAction);
    registerAction2(PauseSocketWriting);
}
const extensionKindSchema = {
    type: 'string',
    enum: [
        'ui',
        'workspace'
    ],
    enumDescriptions: [
        localize('ui', "UI extension kind. In a remote window, such extensions are enabled only when available on the local machine."),
        localize('workspace', "Workspace extension kind. In a remote window, such extensions are enabled only when available on the remote.")
    ],
};
Registry.as(ConfigurationExtensions.Configuration)
    .registerConfiguration({
    id: 'remote',
    title: localize('remote', "Remote"),
    type: 'object',
    properties: {
        'remote.extensionKind': {
            type: 'object',
            markdownDescription: localize('remote.extensionKind', "Override the kind of an extension. `ui` extensions are installed and run on the local machine while `workspace` extensions are run on the remote. By overriding an extension's default kind using this setting, you specify if that extension should be installed and enabled locally or remotely."),
            patternProperties: {
                [EXTENSION_IDENTIFIER_PATTERN]: {
                    oneOf: [{ type: 'array', items: extensionKindSchema }, extensionKindSchema],
                    default: ['ui'],
                },
            },
            default: {
                'pub.name': ['ui']
            }
        },
        'remote.restoreForwardedPorts': {
            type: 'boolean',
            markdownDescription: localize('remote.restoreForwardedPorts', "Restores the ports you forwarded in a workspace."),
            default: true
        },
        'remote.autoForwardPorts': {
            type: 'boolean',
            markdownDescription: localize('remote.autoForwardPorts', "When enabled, new running processes are detected and ports that they listen on are automatically forwarded. Disabling this setting will not prevent all ports from being forwarded. Even when disabled, extensions will still be able to cause ports to be forwarded, and opening some URLs will still cause ports to forwarded. Also see {0}.", '`#remote.autoForwardPortsSource#`'),
            default: true
        },
        'remote.autoForwardPortsSource': {
            type: 'string',
            markdownDescription: localize('remote.autoForwardPortsSource', "Sets the source from which ports are automatically forwarded when {0} is true. When {0} is false, {1} will be used to find information about ports that have already been forwarded. On Windows and macOS remotes, the `process` and `hybrid` options have no effect and `output` will be used.", '`#remote.autoForwardPorts#`', '`#remote.autoForwardPortsSource#`'),
            enum: ['process', 'output', 'hybrid'],
            enumDescriptions: [
                localize('remote.autoForwardPortsSource.process', "Ports will be automatically forwarded when discovered by watching for processes that are started and include a port."),
                localize('remote.autoForwardPortsSource.output', "Ports will be automatically forwarded when discovered by reading terminal and debug output. Not all processes that use ports will print to the integrated terminal or debug console, so some ports will be missed. Ports forwarded based on output will not be \"un-forwarded\" until reload or until the port is closed by the user in the Ports view."),
                localize('remote.autoForwardPortsSource.hybrid', "Ports will be automatically forwarded when discovered by reading terminal and debug output. Not all processes that use ports will print to the integrated terminal or debug console, so some ports will be missed. Ports will be \"un-forwarded\" by watching for processes that listen on that port to be terminated.")
            ],
            default: 'process'
        },
        'remote.autoForwardPortsFallback': {
            type: 'number',
            default: 20,
            markdownDescription: localize('remote.autoForwardPortFallback', "The number of auto forwarded ports that will trigger the switch from `process` to `hybrid` when automatically forwarding ports and `remote.autoForwardPortsSource` is set to `process` by default. Set to `0` to disable the fallback. When `remote.autoForwardPortsFallback` hasn't been configured, but `remote.autoForwardPortsSource` has, `remote.autoForwardPortsFallback` will be treated as though it's set to `0`.")
        },
        'remote.forwardOnOpen': {
            type: 'boolean',
            description: localize('remote.forwardOnClick', "Controls whether local URLs with a port will be forwarded when opened from the terminal and the debug console."),
            default: true
        },
        // Consider making changes to extensions\configuration-editing\schemas\devContainer.schema.src.json
        // and extensions\configuration-editing\schemas\attachContainer.schema.json
        // to keep in sync with devcontainer.json schema.
        'remote.portsAttributes': {
            type: 'object',
            patternProperties: {
                '(^\\d+(-\\d+)?$)|(.+)': {
                    type: 'object',
                    description: localize('remote.portsAttributes.port', "A port, range of ports (ex. \"40000-55000\"), host and port (ex. \"db:1234\"), or regular expression (ex. \".+\\\\/server.js\").  For a port number or range, the attributes will apply to that port number or range of port numbers. Attributes which use a regular expression will apply to ports whose associated process command line matches the expression."),
                    properties: {
                        'onAutoForward': {
                            type: 'string',
                            enum: ['notify', 'openBrowser', 'openBrowserOnce', 'openPreview', 'silent', 'ignore'],
                            enumDescriptions: [
                                localize('remote.portsAttributes.notify', "Shows a notification when a port is automatically forwarded."),
                                localize('remote.portsAttributes.openBrowser', "Opens the browser when the port is automatically forwarded. Depending on your settings, this could open an embedded browser."),
                                localize('remote.portsAttributes.openBrowserOnce', "Opens the browser when the port is automatically forwarded, but only the first time the port is forward during a session. Depending on your settings, this could open an embedded browser."),
                                localize('remote.portsAttributes.openPreview', "Opens a preview in the same window when the port is automatically forwarded."),
                                localize('remote.portsAttributes.silent', "Shows no notification and takes no action when this port is automatically forwarded."),
                                localize('remote.portsAttributes.ignore', "This port will not be automatically forwarded.")
                            ],
                            description: localize('remote.portsAttributes.onForward', "Defines the action that occurs when the port is discovered for automatic forwarding"),
                            default: 'notify'
                        },
                        'elevateIfNeeded': {
                            type: 'boolean',
                            description: localize('remote.portsAttributes.elevateIfNeeded', "Automatically prompt for elevation (if needed) when this port is forwarded. Elevate is required if the local port is a privileged port."),
                            default: false
                        },
                        'label': {
                            type: 'string',
                            description: localize('remote.portsAttributes.label', "Label that will be shown in the UI for this port."),
                            default: localize('remote.portsAttributes.labelDefault', "Application")
                        },
                        'requireLocalPort': {
                            type: 'boolean',
                            markdownDescription: localize('remote.portsAttributes.requireLocalPort', "When true, a modal dialog will show if the chosen local port isn't used for forwarding."),
                            default: false
                        },
                        'protocol': {
                            type: 'string',
                            enum: ['http', 'https'],
                            description: localize('remote.portsAttributes.protocol', "The protocol to use when forwarding this port.")
                        }
                    },
                    default: {
                        'label': localize('remote.portsAttributes.labelDefault', "Application"),
                        'onAutoForward': 'notify'
                    }
                }
            },
            markdownDescription: localize('remote.portsAttributes', "Set properties that are applied when a specific port number is forwarded. For example:\n\n```\n\"3000\": {\n  \"label\": \"Application\"\n},\n\"40000-55000\": {\n  \"onAutoForward\": \"ignore\"\n},\n\".+\\\\/server.js\": {\n \"onAutoForward\": \"openPreview\"\n}\n```"),
            defaultSnippets: [{ body: { '${1:3000}': { label: '${2:Application}', onAutoForward: 'openPreview' } } }],
            errorMessage: localize('remote.portsAttributes.patternError', "Must be a port number, range of port numbers, or regular expression."),
            additionalProperties: false,
            default: {
                '443': {
                    'protocol': 'https'
                },
                '8443': {
                    'protocol': 'https'
                }
            }
        },
        'remote.otherPortsAttributes': {
            type: 'object',
            properties: {
                'onAutoForward': {
                    type: 'string',
                    enum: ['notify', 'openBrowser', 'openPreview', 'silent', 'ignore'],
                    enumDescriptions: [
                        localize('remote.portsAttributes.notify', "Shows a notification when a port is automatically forwarded."),
                        localize('remote.portsAttributes.openBrowser', "Opens the browser when the port is automatically forwarded. Depending on your settings, this could open an embedded browser."),
                        localize('remote.portsAttributes.openPreview', "Opens a preview in the same window when the port is automatically forwarded."),
                        localize('remote.portsAttributes.silent', "Shows no notification and takes no action when this port is automatically forwarded."),
                        localize('remote.portsAttributes.ignore', "This port will not be automatically forwarded.")
                    ],
                    description: localize('remote.portsAttributes.onForward', "Defines the action that occurs when the port is discovered for automatic forwarding"),
                    default: 'notify'
                },
                'elevateIfNeeded': {
                    type: 'boolean',
                    description: localize('remote.portsAttributes.elevateIfNeeded', "Automatically prompt for elevation (if needed) when this port is forwarded. Elevate is required if the local port is a privileged port."),
                    default: false
                },
                'label': {
                    type: 'string',
                    description: localize('remote.portsAttributes.label', "Label that will be shown in the UI for this port."),
                    default: localize('remote.portsAttributes.labelDefault', "Application")
                },
                'requireLocalPort': {
                    type: 'boolean',
                    markdownDescription: localize('remote.portsAttributes.requireLocalPort', "When true, a modal dialog will show if the chosen local port isn't used for forwarding."),
                    default: false
                },
                'protocol': {
                    type: 'string',
                    enum: ['http', 'https'],
                    description: localize('remote.portsAttributes.protocol', "The protocol to use when forwarding this port.")
                }
            },
            defaultSnippets: [{ body: { onAutoForward: 'ignore' } }],
            markdownDescription: localize('remote.portsAttributes.defaults', "Set default properties that are applied to all ports that don't get properties from the setting {0}. For example:\n\n```\n{\n  \"onAutoForward\": \"ignore\"\n}\n```", '`#remote.portsAttributes#`'),
            additionalProperties: false
        },
        'remote.localPortHost': {
            type: 'string',
            enum: ['localhost', 'allInterfaces'],
            default: 'localhost',
            description: localize('remote.localPortHost', "Specifies the local host name that will be used for port forwarding.")
        },
        [REMOTE_DEFAULT_IF_LOCAL_EXTENSIONS]: {
            type: 'array',
            markdownDescription: localize('remote.defaultExtensionsIfInstalledLocally.markdownDescription', 'List of extensions to install upon connection to a remote when already installed locally.'),
            default: product?.remoteDefaultExtensionsIfInstalledLocally || [],
            items: {
                type: 'string',
                pattern: EXTENSION_IDENTIFIER_PATTERN,
                patternErrorMessage: localize('remote.defaultExtensionsIfInstalledLocally.invalidFormat', 'Extension identifier must be in format "publisher.name".')
            },
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9jb21tb24vcmVtb3RlLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQTJFLFVBQVUsSUFBSSxtQkFBbUIsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzlMLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUU1RSxPQUFPLEVBQUUsYUFBYSxFQUEyQixNQUFNLDRDQUE0QyxDQUFDO0FBQ3BHLE9BQU8sRUFBbUIsS0FBSyxFQUFFLEVBQUUsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM1RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUEwQixVQUFVLElBQUksdUJBQXVCLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUVuSixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzFHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FB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