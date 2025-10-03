/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, WorkbenchPhase, Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { ILabelService, ResourceLabelFormatting } from '../../../../platform/label/common/label.js';
import { OperatingSystem, isWeb, OS } from '../../../../base/common/platform.js';
import { Schemas } from '../../../../base/common/network.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { localize, localize2 } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { PersistentConnection } from '../../../../platform/remote/common/remoteAgentConnection.js';
import { IDownloadService } from '../../../../platform/download/common/download.js';
import { DownloadServiceChannel } from '../../../../platform/download/common/downloadIpc.js';
import { RemoteLoggerChannelClient } from '../../../../platform/log/common/logIpc.js';
import { REMOTE_DEFAULT_IF_LOCAL_EXTENSIONS } from '../../../../platform/remote/common/remote.js';
import product from '../../../../platform/product/common/product.js';


const EXTENSION_IDENTIFIER_PATTERN = '([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$';

export class LabelContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.remoteLabel';

	constructor(
		@ILabelService private readonly labelService: ILabelService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService) {
		this.registerFormatters();
	}

	private registerFormatters(): void {
		this.remoteAgentService.getEnvironment().then(remoteEnvironment => {
			const os = remoteEnvironment?.os || OS;
			const formatting: ResourceLabelFormatting = {
				label: '${path}',
				separator: os === OperatingSystem.Windows ? '\\' : '/',
				tildify: os !== OperatingSystem.Windows,
				normalizeDriveLetter: os === OperatingSystem.Windows,
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
}

class RemoteChannelsContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IDownloadService downloadService: IDownloadService,
		@ILoggerService loggerService: ILoggerService,
	) {
		super();
		const connection = remoteAgentService.getConnection();
		if (connection) {
			connection.registerChannel('download', new DownloadServiceChannel(downloadService));
			connection.withChannel('logger', async channel => this._register(new RemoteLoggerChannelClient(loggerService, channel)));
		}
	}
}

class RemoteInvalidWorkspaceDetector extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.remoteInvalidWorkspaceDetector';

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService
	) {
		super();

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

	private async validateRemoteWorkspace(): Promise<void> {
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
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
registerWorkbenchContribution2(LabelContribution.ID, LabelContribution, WorkbenchPhase.BlockStartup);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteChannelsContribution, LifecyclePhase.Restored);
registerWorkbenchContribution2(RemoteInvalidWorkspaceDetector.ID, RemoteInvalidWorkspaceDetector, WorkbenchPhase.BlockStartup);

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

		async run(accessor: ServicesAccessor): Promise<void> {
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

		async run(accessor: ServicesAccessor): Promise<void> {
			PersistentConnection.debugPauseSocketWriting();
		}
	}

	registerAction2(TriggerReconnectAction);
	registerAction2(PauseSocketWriting);
}

const extensionKindSchema: IJSONSchema = {
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

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
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
