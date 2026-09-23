/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../../../base/common/arrays.js';
import { DeferredPromise, Delayer } from '../../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableFromEventOpts, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../../../platform/mcp/common/mcpManagement.js';
import { COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from '../../../../../../platform/policy/common/copilotManagedSettings.js';
import { isStrictPluginOnlyCustomizationEnabled, StrictPluginOnlyCustomization } from '../../../common/customizationLockdown.js';
import { ICustomizationMcpServerCompatibility, ICustomizationMcpServerCompatibilityScope } from '../../../common/customizationHarnessService.js';
import { IMcpService, IMcpWorkbenchService } from '../../../../mcp/common/mcpTypes.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { AgentHostMcpServerApplicability, AgentHostMcpSupportReason, assessMcpServersForCopilotAgentHost, IAgentHostInstalledMcpServer, IAgentHostMcpServerSupportSnapshot, mergeInstalledMcpServersIntoAgentHostSupportAssessment } from './agentHostMcpServerSupport.js';

const MCP_SUPPORT_UPDATE_DEBOUNCE_DELAY = 50;

function createEmptySupportSnapshot(coverage: IAgentHostMcpServerSupportSnapshot['coverage']): IAgentHostMcpServerSupportSnapshot {
	return {
		servers: [],
		discoveryComplete: false,
		coverage,
	};
}

/** A refcounted reactive view of MCP support for one Agent Host working-directory scope. */
export interface IAgentHostMcpServerSupportScope extends IDisposable {
	/** The latest settled support snapshot. */
	readonly support: IObservable<IAgentHostMcpServerSupportSnapshot>;
	/** Whether the latest scheduled support assessment has settled. */
	readonly isResolved: IObservable<boolean>;
	/** Resolves after the latest scheduled support assessment settles or the scope is disposed. */
	whenResolved(): Promise<void>;
}

export function createCustomizationMcpServerCompatibilityScope(
	onDidChange: Event<void>,
	getWorkingDirectories: () => readonly URI[],
	acquireScope: (roots: readonly URI[]) => IAgentHostMcpServerSupportScope | undefined,
): ICustomizationMcpServerCompatibilityScope {
	const store = new DisposableStore();
	const servers = observableValue<readonly ICustomizationMcpServerCompatibility[]>('mcpServerCompatibility', []);
	const isResolved = observableValue('mcpServerCompatibilityResolved', false);
	const workingDirectories = observableFromEventOpts(
		{ equalsFn: (a, b) => equals(a, b, isEqual) },
		onDidChange,
		getWorkingDirectories,
	);
	store.add(autorun(reader => {
		const scope = acquireScope(workingDirectories.read(reader));
		if (!scope) {
			transaction(tx => {
				servers.set([], tx);
				isResolved.set(true, tx);
			});
			return;
		}
		reader.store.add(scope);
		reader.store.add(autorun(reader => {
			const compatibility = scope.support.read(reader).servers
				.filter(server => server.applicability !== AgentHostMcpServerApplicability.OutsideCurrentScope)
				.map(server => ({
					id: server.id,
					kind: server.compatibility.kind,
					details: server.compatibility.kind === 'supported' ? undefined : server.compatibility.reasons.map(getMcpCompatibilityDetail),
				}));
			const resolved = scope.isResolved.read(reader);
			transaction(tx => {
				servers.set(compatibility, tx);
				isResolved.set(resolved, tx);
			});
		}));
	}));
	return {
		servers,
		isResolved,
		dispose: () => store.dispose(),
	};
}

export function getMcpCompatibilityDetail(reason: AgentHostMcpSupportReason): string {
	switch (reason) {
		case AgentHostMcpSupportReason.UnsupportedSourceLocation:
			return localize('mcpCompatibilityUnsupportedSourceLocation', "The current configuration location for this server is not supported by the Copilot harness.\nTo migrate this server, move its configuration to the workspace root .mcp.json file.");
		case AgentHostMcpSupportReason.RequiresUserInteraction:
			return localize('mcpCompatibilityRequiresUserInteraction', "Input and command variables are not supported by the Copilot harness.\nTo migrate this server, replace them with concrete values or environment variables defined directly in the server configuration.");
		case AgentHostMcpSupportReason.UnresolvedConfiguration:
			return localize('mcpCompatibilityUnresolvedConfiguration', "Unresolved configuration, environment, or workspace variables are not supported by the Copilot harness.\nTo migrate this server, define the missing variables or replace them with concrete values.");
		case AgentHostMcpSupportReason.LaunchNotRepresentable:
			return localize('mcpCompatibilityLaunchNotRepresentable', "The launch configuration for this server is not supported by the Copilot harness.\nTo migrate this server, add a command for a local server or a valid URL for a remote server.");
		case AgentHostMcpSupportReason.EnvironmentFileIgnored:
			return localize('mcpCompatibilityEnvironmentFileIgnored', "Environment files are not supported by the Copilot harness.\nTo migrate this server, move required variables from the environment file into the server env configuration.");
		case AgentHostMcpSupportReason.WorkingDirectoryNotPortable:
			return localize('mcpCompatibilityWorkingDirectoryNotPortable', "Working directory settings cannot be migrated to the workspace root .mcp.json file.\nTo migrate this server, remove the cwd property.");
		case AgentHostMcpSupportReason.ServerVersionNotPortable:
			return localize('mcpCompatibilityServerVersionNotPortable', "Server version metadata cannot be migrated to the workspace root .mcp.json file.\nTo migrate this server, remove the version property.");
		case AgentHostMcpSupportReason.SseTransportNotPortable:
			return localize('mcpCompatibilitySseTransportNotPortable', "SSE transport settings cannot be migrated to the workspace root .mcp.json file.\nTo migrate this server, use the default HTTP transport.");
		case AgentHostMcpSupportReason.SandboxConfigurationIgnored:
			return localize('mcpCompatibilitySandboxConfigurationIgnored', "Per-server sandbox settings are not supported by the Copilot harness.\nTo migrate this server, remove the server sandbox setting.");
		case AgentHostMcpSupportReason.DevelopmentModeIgnored:
			return localize('mcpCompatibilityDevelopmentModeIgnored', "MCP development mode is not supported by the Copilot harness.\nTo migrate this server, remove the development mode setting and restart the server manually after configuration changes.");
		case AgentHostMcpSupportReason.OAuthClientConfigurationIgnored:
			return localize('mcpCompatibilityOAuthClientConfigurationIgnored', "Custom OAuth client configuration is not supported by the Copilot harness.\nTo migrate this server, remove the custom OAuth client configuration and sign in when the Copilot harness prompts for authentication.");
		case AgentHostMcpSupportReason.DefinitionNotLoaded:
			return localize('mcpCompatibilityDefinitionNotLoaded', "Compatibility cannot be determined because the server definition has not loaded.\nTo migrate this server, wait for MCP discovery to finish, then refresh this view. If the issue persists, check the server configuration for errors.");
		case AgentHostMcpSupportReason.SourceUnknown:
			return localize('mcpCompatibilitySourceUnknown', "Compatibility cannot be determined because the server configuration source is unknown.\nTo migrate this server, move its configuration to a recognized location such as the workspace root .mcp.json file.");
	}
}

/** Owns MCP support assessment and refreshes it while at least one consumer holds a reference. */
export class AgentHostMcpServerSupportScope extends Disposable {
	private readonly _updateDelayer: Delayer<void>;
	private readonly _support = observableValue<IAgentHostMcpServerSupportSnapshot>('agentHostMcpServerSupport', {
		servers: [],
		discoveryComplete: false,
		coverage: {
			restrictedByMcpAccess: false,
			restrictedByCustomizationPolicy: false,
		},
	});
	private readonly _isResolved = observableValue('agentHostMcpServerSupportResolved', false);
	private _latestResolution = new DeferredPromise<void>();
	private _refCount = 0;
	private _updateSequence = 0;
	private _isDisposed = false;

	constructor(
		private readonly _sessionType: string,
		private readonly _roots: readonly URI[] | undefined,
		private readonly _onDispose: () => void,
		@IMcpService private readonly _mcpService: IMcpService,
		@IMcpWorkbenchService private readonly _mcpWorkbenchService: IMcpWorkbenchService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._updateDelayer = this._register(new Delayer<void>(MCP_SUPPORT_UPDATE_DEBOUNCE_DELAY));

		const update = async (sequence: number) => {
			try {
				const lazyState = this._mcpService.lazyCollectionState.get();
				const initialAssessment = await assessMcpServersForCopilotAgentHost(
					this._mcpService.servers.get(),
					this._configurationResolverService,
					this._sessionType,
					this._roots,
					lazyState.state,
				);
				if (!initialAssessment) {
					this._completeUpdate(sequence, createEmptySupportSnapshot(this._getCoverage()));
					return;
				}
				if (sequence !== this._updateSequence || this._isDisposed) {
					return;
				}
				await this._mcpWorkbenchService.whenInitialLocalMcpServersLoaded;
				if (sequence !== this._updateSequence || this._isDisposed) {
					return;
				}
				const installedServers = this._mcpWorkbenchService.local.flatMap(server => {
					const local = server.local;
					return local ? [{
						id: local.id,
						name: server.name,
						label: server.label,
						configuration: local.config,
						configPath: this._mcpWorkbenchService.getMcpConfigPath(local),
						sandbox: local.rootSandbox,
						runtimeState: server.runtimeStatus?.state,
					} satisfies IAgentHostInstalledMcpServer] : [];
				});
				const assessment = await mergeInstalledMcpServersIntoAgentHostSupportAssessment(
					initialAssessment,
					installedServers,
					this._configurationResolverService,
					this._roots,
				);
				if (sequence !== this._updateSequence) {
					return;
				}
				this._completeUpdate(sequence, { ...assessment, coverage: this._getCoverage() });
			} catch (error) {
				onUnexpectedError(error);
				this._completeUpdate(sequence, createEmptySupportSnapshot(this._getCoverage()));
			} finally {
				if (sequence === this._updateSequence && !this._latestResolution.isSettled) {
					this._latestResolution.complete();
				}
			}
		};
		const scheduleUpdate = () => {
			if (this._isDisposed) {
				return;
			}
			const sequence = ++this._updateSequence;
			const previousResolution = this._latestResolution;
			this._latestResolution = new DeferredPromise<void>();
			transaction(tx => this._isResolved.set(false, tx));
			if (!previousResolution.isSettled) {
				previousResolution.complete();
			}
			this._updateDelayer.trigger(() => update(sequence)).catch(() => { /* scope disposed */ });
		};

		this._register(autorun(reader => {
			for (const server of this._mcpService.servers.read(reader)) {
				server.readDefinitions().read(reader);
				server.enablement.read(reader);
			}
			this._mcpService.lazyCollectionState.read(reader);
			scheduleUpdate();
		}));
		this._register(this._mcpWorkbenchService.onChange(scheduleUpdate));
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(mcpAccessConfig) || event.affectsConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG)) {
				scheduleUpdate();
			}
		}));
	}

	acquire(): IAgentHostMcpServerSupportScope {
		this._refCount++;
		let released = false;
		return {
			support: this._support,
			isResolved: this._isResolved,
			whenResolved: () => this._whenResolved(),
			dispose: () => {
				if (!released) {
					released = true;
					this._release();
				}
			},
		};
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._updateSequence++;
		if (!this._latestResolution.isSettled) {
			this._latestResolution.complete();
		}
		super.dispose();
		this._onDispose();
	}

	private async _whenResolved(): Promise<void> {
		while (!this._isDisposed) {
			const resolution = this._latestResolution;
			await resolution.p;
			if (resolution === this._latestResolution) {
				return;
			}
		}
	}

	private _completeUpdate(sequence: number, snapshot: IAgentHostMcpServerSupportSnapshot): void {
		if (sequence !== this._updateSequence || this._isDisposed) {
			return;
		}
		transaction(tx => {
			this._support.set(snapshot, tx);
			this._isResolved.set(true, tx);
		});
	}

	private _getCoverage(): IAgentHostMcpServerSupportSnapshot['coverage'] {
		const access = this._configurationService.getValue<McpAccessValue>(mcpAccessConfig);
		const strictPluginOnly = this._configurationService.getValue<StrictPluginOnlyCustomization>(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG);
		return {
			restrictedByMcpAccess: access !== McpAccessValue.All,
			restrictedByCustomizationPolicy: isStrictPluginOnlyCustomizationEnabled(strictPluginOnly),
		};
	}

	private _release(): void {
		if (--this._refCount === 0) {
			this.dispose();
		}
	}
}
