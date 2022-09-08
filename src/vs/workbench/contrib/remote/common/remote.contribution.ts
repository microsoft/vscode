/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ILabelService, ResourceLabelFormatting } from 'vs/platform/label/common/label';
import { OperatingSystem, isWeb, OS } from 'vs/base/common/platform';
import { Schemas } from 'vs/base/common/network';
import { IRemoteAgentService, RemoteExtensionLogFileName } from 'vs/workbench/services/remote/common/remoteAgentService';
import { ILogService } from 'vs/platform/log/common/log';
import { LogLevelChannel, LogLevelChannelClient } from 'vs/platform/log/common/logIpc';
import { IOutputChannelRegistry, Extensions as OutputExt, } from 'vs/workbench/services/output/common/output';
import { localize } from 'vs/nls';
import { joinPath } from 'vs/base/common/resources';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { IFileService } from 'vs/platform/files/common/files';
import { IDialogService, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { firstOrDefault } from 'vs/base/common/arrays';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { PersistentConnection } from 'vs/platform/remote/common/remoteAgentConnection';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { getRemoteName } from 'vs/platform/remote/common/remoteHosts';
import { IDownloadService } from 'vs/platform/download/common/download';
import { DownloadServiceChannel } from 'vs/platform/download/common/downloadIpc';
import { timeout } from 'vs/base/common/async';
import { TerminalLogConstants } from 'vs/platform/terminal/common/terminal';

export class LabelContribution implements IWorkbenchContribution {
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
		@ILogService logService: ILogService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IDownloadService downloadService: IDownloadService
	) {
		super();
		const updateRemoteLogLevel = () => {
			const connection = remoteAgentService.getConnection();
			if (!connection) {
				return;
			}
			connection.withChannel('logger', (channel) => LogLevelChannelClient.setLevel(channel, logService.getLevel()));
		};
		updateRemoteLogLevel();
		this._register(logService.onDidChangeLogLevel(updateRemoteLogLevel));
		const connection = remoteAgentService.getConnection();
		if (connection) {
			connection.registerChannel('download', new DownloadServiceChannel(downloadService));
			connection.registerChannel('logger', new LogLevelChannel(logService));
		}
	}
}

class RemoteLogOutputChannels implements IWorkbenchContribution {

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService
	) {
		remoteAgentService.getEnvironment().then(remoteEnv => {
			if (remoteEnv) {
				const outputChannelRegistry = Registry.as<IOutputChannelRegistry>(OutputExt.OutputChannels);
				outputChannelRegistry.registerChannel({ id: 'remoteExtensionLog', label: localize('remoteExtensionLog', "Remote Server"), file: joinPath(remoteEnv.logsPath, `${RemoteExtensionLogFileName}.log`), log: true });
				outputChannelRegistry.registerChannel({ id: 'remotePtyHostLog', label: localize('remotePtyHostLog', "Remote Pty Host"), file: joinPath(remoteEnv.logsPath, `${TerminalLogConstants.FileName}.log`), log: true });
			}
		});
	}
}

class RemoteInvalidWorkspaceDetector extends Disposable implements IWorkbenchContribution {

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
		const workspaceUriToStat = workspace.configuration ?? firstOrDefault(workspace.folders)?.uri;
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
			detail: localize('invalidWorkspaceDetail', "The workspace does not exist. Please select another workspace to open."),
			primaryButton: localize('invalidWorkspacePrimary', "&&Open Workspace..."),
			secondaryButton: localize('invalidWorkspaceCancel', "&&Cancel")
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

const EXT_HOST_LATENCY_SAMPLES = 5;
const EXT_HOST_LATENCY_DELAY = 2_000;

class InitialRemoteConnectionHealthContribution implements IWorkbenchContribution {

	constructor(
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		if (this._environmentService.remoteAuthority) {
			this._checkInitialRemoteConnectionHealth();
		}
	}

	private async _checkInitialRemoteConnectionHealth(): Promise<void> {
		try {
			await this._remoteAgentService.getRawEnvironment();

			type RemoteConnectionSuccessClassification = {
				owner: 'alexdima';
				comment: 'The initial connection succeeded';
				web: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Is web ui.' };
				connectionTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Time, in ms, until connected'; isMeasurement: true };
				remoteName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The name of the resolver.' };
			};
			type RemoteConnectionSuccessEvent = {
				web: boolean;
				connectionTimeMs: number | undefined;
				remoteName: string | undefined;
			};
			this._telemetryService.publicLog2<RemoteConnectionSuccessEvent, RemoteConnectionSuccessClassification>('remoteConnectionSuccess', {
				web: isWeb,
				connectionTimeMs: await this._remoteAgentService.getConnection()?.getInitialConnectionTimeMs(),
				remoteName: getRemoteName(this._environmentService.remoteAuthority)
			});

			await this._measureExtHostLatency();

		} catch (err) {

			type RemoteConnectionFailureClassification = {
				owner: 'alexdima';
				comment: 'The initial connection failed';
				web: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Is web ui.' };
				remoteName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The name of the resolver.' };
				connectionTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Time, in ms, until connection failure'; isMeasurement: true };
				message: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Error message' };
			};
			type RemoteConnectionFailureEvent = {
				web: boolean;
				remoteName: string | undefined;
				connectionTimeMs: number | undefined;
				message: string;
			};
			this._telemetryService.publicLog2<RemoteConnectionFailureEvent, RemoteConnectionFailureClassification>('remoteConnectionFailure', {
				web: isWeb,
				connectionTimeMs: await this._remoteAgentService.getConnection()?.getInitialConnectionTimeMs(),
				remoteName: getRemoteName(this._environmentService.remoteAuthority),
				message: err ? err.message : ''
			});

		}
	}

	private async _measureExtHostLatency() {
		// Get the minimum latency, since latency spikes could be caused by a busy extension host.
		let bestLatency = Infinity;
		for (let i = 0; i < EXT_HOST_LATENCY_SAMPLES; i++) {
			const rtt = await this._remoteAgentService.getRoundTripTime();
			if (rtt === undefined) {
				return;
			}
			bestLatency = Math.min(bestLatency, rtt / 2);
			await timeout(EXT_HOST_LATENCY_DELAY);
		}

		type RemoteConnectionLatencyClassification = {
			owner: 'connor4312';
			comment: 'The latency to the remote extension host';
			web: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether this is running on web' };
			remoteName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Anonymized remote name' };
			latencyMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Latency to the remote, in milliseconds'; isMeasurement: true };
		};
		type RemoteConnectionLatencyEvent = {
			web: boolean;
			remoteName: string | undefined;
			latencyMs: number;
		};

		this._telemetryService.publicLog2<RemoteConnectionLatencyEvent, RemoteConnectionLatencyClassification>('remoteConnectionLatency', {
			web: isWeb,
			remoteName: getRemoteName(this._environmentService.remoteAuthority),
			latencyMs: bestLatency
		});
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(LabelContribution, 'LabelContribution', LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteChannelsContribution, 'RemoteChannelsContribution', LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteInvalidWorkspaceDetector, 'RemoteInvalidWorkspaceDetector', LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteLogOutputChannels, 'RemoteLogOutputChannels', LifecyclePhase.Restored);
workbenchContributionsRegistry.registerWorkbenchContribution(InitialRemoteConnectionHealthContribution, 'InitialRemoteConnectionHealthContribution', LifecyclePhase.Ready);

const enableDiagnostics = true;

if (enableDiagnostics) {
	class TriggerReconnectAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.triggerReconnect',
				title: { value: localize('triggerReconnect', "Connection: Trigger Reconnect"), original: 'Connection: Trigger Reconnect' },
				category: CATEGORIES.Developer,
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
				title: { value: localize('pauseSocketWriting', "Connection: Pause socket writing"), original: 'Connection: Pause socket writing' },
				category: CATEGORIES.Developer,
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
					'([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$': {
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
				markdownDescription: localize('remote.autoForwardPorts', "When enabled, new running processes are detected and ports that they listen on are automatically forwarded. Disabling this setting will not prevent all ports from being forwarded. Even when disabled, extensions will still be able to cause ports to be forwarded, and opening some URLs will still cause ports to forwarded."),
				default: true
			},
			'remote.autoForwardPortsSource': {
				type: 'string',
				markdownDescription: localize('remote.autoForwardPortsSource', "Sets the source from which ports are automatically forwarded when {0} is true. On Windows and Mac remotes, the `process` option has no effect and `output` will be used. Requires a reload to take effect.", '`#remote.autoForwardPorts#`'),
				enum: ['process', 'output'],
				enumDescriptions: [
					localize('remote.autoForwardPortsSource.process', "Ports will be automatically forwarded when discovered by watching for processes that are started and include a port."),
					localize('remote.autoForwardPortsSource.output', "Ports will be automatically forwarded when discovered by reading terminal and debug output. Not all processes that use ports will print to the integrated terminal or debug console, so some ports will be missed. Ports forwarded based on output will not be \"un-forwarded\" until reload or until the port is closed by the user in the Ports view.")
				],
				default: 'process'
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
			}
		}
	});
