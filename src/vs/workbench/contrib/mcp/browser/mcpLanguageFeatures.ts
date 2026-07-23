/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { computeLevenshteinDistance } from '../../../../base/common/diff/diff.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createMarkdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { findNodeAtLocation, Node, parseTree } from '../../../../base/common/json.js';
import { Disposable, DisposableStore, dispose, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { CodeLens, CodeLensList, CodeLensProvider, InlayHint, InlayHintList } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../nls.js';
import { IAgentHostConnectionInfo, IAgentHostConnectionsService, LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { remoteAgentHostSessionTypeId } from '../../../../platform/agentHost/common/agentHostSessionType.js';
import { AgentSession } from '../../../../platform/agentHost/common/agentService.js';
import { ActionType } from '../../../../platform/agentHost/common/state/protocol/actions.js';
import { CustomizationType, McpServerStatus, type ChildCustomization, type Customization, type SessionState } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression, IResolvedValue } from '../../../services/configurationResolver/common/configurationResolverExpression.js';
import { IAgentHostCustomizationService } from '../../chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { isContributionDisabled } from '../../chat/common/enablement.js';
import { McpCommandIds } from '../common/mcpCommandIds.js';
import { mcpConfigurationSection } from '../common/mcpConfiguration.js';
import { countRunningMcpServersInOtherSessions, getActiveAgentHostMcpSessionResource, IMcpEditorAgentHostServer, type IMcpEditorAgentHostSessionServers } from '../common/mcpEditorAffordanceState.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { IMcpConfigPath, IMcpServerStartOpts, IMcpService, IMcpWorkbenchService, McpConnectionState, mcpOAuthClientSecretStorageKey } from '../common/mcpTypes.js';

const diagnosticOwner = 'vscode.mcp';

type ConfigDescriptor = Pick<IMcpConfigPath, 'section' | 'scope' | 'target'> & {
	serversKey?: string;
};

type AgentHostMcpServer = ReturnType<IAgentHostCustomizationService['getMcpServers']>[number];

export class McpLanguageFeatures extends Disposable implements IWorkbenchContribution {
	private readonly _cachedMcpSection = this._register(new MutableDisposable<{ model: ITextModel; inConfig: ConfigDescriptor; tree: Node } & IDisposable>());

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IMcpWorkbenchService private readonly _mcpWorkbenchService: IMcpWorkbenchService,
		@IMcpService private readonly _mcpService: IMcpService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IAgentHostCustomizationService private readonly _agentHostCustomizationService: IAgentHostCustomizationService,
		@IAgentHostConnectionsService private readonly _agentHostConnectionsService: IAgentHostConnectionsService,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		@ISecretStorageService private readonly _secretStorageService: ISecretStorageService,
	) {
		super();

		const patterns = [
			{ pattern: '**/mcp.json' },
			{ pattern: '**/.mcp.json' },
			{ pattern: '**/workspace.json' },
		];

		const onDidChangeCodeLens = this._register(new Emitter<CodeLensProvider>());
		const codeLensProvider: CodeLensProvider = {
			onDidChange: onDidChangeCodeLens.event,
			provideCodeLenses: (model, range) => this._provideCodeLenses(model, () => onDidChangeCodeLens.fire(codeLensProvider)),
		};
		const refreshCodeLens = () => onDidChangeCodeLens.fire(codeLensProvider);
		this._register(languageFeaturesService.codeLensProvider.register(patterns, codeLensProvider));
		this._register(this._secretStorageService.onDidChangeSecret(key => {
			if (key.startsWith('mcp.oauth.clientSecret:')) {
				refreshCodeLens();
			}
		}));
		const focusedWidgetViewModelListener = this._register(new MutableDisposable());
		const updateFocusedWidgetViewModelListener = () => {
			focusedWidgetViewModelListener.value = this._chatWidgetService.lastFocusedWidget?.onDidChangeViewModel(refreshCodeLens);
			refreshCodeLens();
		};
		const connectionStateListeners = this._register(new MutableDisposable<DisposableStore>());
		const updateConnectionStateListeners = () => {
			const store = new DisposableStore();
			for (const connectionInfo of this._agentHostConnectionsService.connections) {
				const connection = connectionInfo.connection;
				if (connection) {
					store.add(connection.onDidAction(({ action }) => {
						switch (action.type) {
							case ActionType.SessionCustomizationsChanged:
							case ActionType.SessionCustomizationUpdated:
							case ActionType.SessionCustomizationRemoved:
							case ActionType.SessionMcpServerStateChanged:
								refreshCodeLens();
								break;
						}
					}));
				}
			}
			connectionStateListeners.value = store;
			refreshCodeLens();
		};
		updateFocusedWidgetViewModelListener();
		updateConnectionStateListeners();
		this._register(this._chatWidgetService.onDidChangeFocusedWidget(updateFocusedWidgetViewModelListener));
		this._register(this._chatWidgetService.onDidChangeFocusedSession(refreshCodeLens));
		this._register(this._agentHostConnectionsService.onDidChangeConnections(updateConnectionStateListeners));
		this._register(this._agentHostCustomizationService.onDidChangeCustomizations(refreshCodeLens));

		this._register(languageFeaturesService.inlayHintsProvider.register(patterns, {
			onDidChangeInlayHints: _mcpRegistry.onDidChangeInputs,
			provideInlayHints: (model, range) => this._provideInlayHints(model, range),
		}));
	}

	/** Simple mechanism to avoid extra json parsing for hints+lenses */
	private async _parseModel(model: ITextModel) {
		if (this._cachedMcpSection.value?.model === model) {
			return this._cachedMcpSection.value;
		}

		const uri = model.uri;
		const inConfig: ConfigDescriptor | undefined = uri.path.endsWith('/.mcp.json')
			? { scope: StorageScope.WORKSPACE, target: ConfigurationTarget.WORKSPACE_FOLDER, serversKey: 'mcpServers' }
			: await this._mcpWorkbenchService.getMcpConfigPath(model.uri);
		if (!inConfig) {
			return undefined;
		}

		const value = model.getValue();
		const tree = parseTree(value);
		const listeners = [
			model.onDidChangeContent(() => this._cachedMcpSection.clear()),
			model.onWillDispose(() => this._cachedMcpSection.clear()),
		];
		this._addDiagnostics(model, value, tree, inConfig);

		return this._cachedMcpSection.value = {
			model,
			tree,
			inConfig,
			dispose: () => {
				this._markerService.remove(diagnosticOwner, [uri]);
				dispose(listeners);
			}
		};
	}

	private _addDiagnostics(tm: ITextModel, value: string, tree: Node, inConfig: ConfigDescriptor) {
		const serversKey = inConfig.serversKey ?? 'servers';
		const serversNode = findNodeAtLocation(tree, inConfig.section ? [...inConfig.section, serversKey] : [serversKey]);
		if (!serversNode) {
			return;
		}

		const getClosestMatchingVariable = (name: string) => {
			let bestValue = '';
			let bestDistance = Infinity;
			for (const variable of this._configurationResolverService.resolvableVariables) {
				const distance = computeLevenshteinDistance(name, variable);
				if (distance < bestDistance) {
					bestDistance = distance;
					bestValue = variable;
				}
			}
			return bestValue;
		};

		const diagnostics: IMarkerData[] = [];
		forEachPropertyWithReplacement(serversNode, node => {
			const expr = ConfigurationResolverExpression.parse(node.value);

			for (const { id, name, arg } of expr.unresolved()) {
				if (!this._configurationResolverService.resolvableVariables.has(name)) {
					const position = value.indexOf(id, node.offset);
					if (position === -1) { continue; } // unreachable?

					const start = tm.getPositionAt(position);
					const end = tm.getPositionAt(position + id.length);
					diagnostics.push({
						severity: MarkerSeverity.Warning,
						message: localize('mcp.variableNotFound', 'Variable `{0}` not found, did you mean ${{1}}?', name, getClosestMatchingVariable(name) + (arg ? `:${arg}` : '')),
						startLineNumber: start.lineNumber,
						startColumn: start.column,
						endLineNumber: end.lineNumber,
						endColumn: end.column,
						modelVersionId: tm.getVersionId(),
					});
				}
			}
		});

		if (diagnostics.length) {
			this._markerService.changeOne(diagnosticOwner, tm.uri, diagnostics);
		} else {
			this._markerService.remove(diagnosticOwner, [tm.uri]);
		}
	}

	private async _provideCodeLenses(model: ITextModel, onDidChangeCodeLens: () => void): Promise<CodeLensList | undefined> {
		const parsed = await this._parseModel(model);
		if (!parsed) {
			return undefined;
		}

		const { tree, inConfig } = parsed;
		const serversKey = inConfig.serversKey ?? 'servers';
		const serversNode = findNodeAtLocation(tree, inConfig.section ? [...inConfig.section, serversKey] : [serversKey]);
		if (!serversNode) {
			return undefined;
		}

		const store = new DisposableStore();
		const lenses: CodeLens[] = [];
		const lensList: CodeLensList = { lenses, dispose: () => store.dispose() };
		const read = <T>(observable: IObservable<T>): T => {
			store.add(Event.fromObservableLight(observable)(onDidChangeCodeLens));
			return observable.get();
		};

		const collection = read(this._mcpRegistry.collections).find(c => isEqual(c.presentation?.origin, model.uri));
		if (!collection) {
			return lensList;
		}

		const agentHostSession = getActiveAgentHostMcpSessionResource(this._chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource);
		if (agentHostSession) {
			const mcpServers = this._agentHostCustomizationService.getMcpServers(agentHostSession);
			const otherRunningCounts = this._getOtherRunningAgentHostMcpServerCounts(agentHostSession);
			for (const node of serversNode.children || []) {
				if (node.type !== 'property' || node.children?.[0]?.type !== 'string') {
					continue;
				}

				const name = node.children[0].value as string;
				const server = mcpServers.find(s => s.name === name);
				if (!server) {
					continue;
				}

				this._addAgentHostServerCodeLenses(lenses, Range.fromPositions(model.getPositionAt(node.children[0].offset)), agentHostSession, server, otherRunningCounts.get(name) ?? 0);
			}
		} else {
			const mcpServers = read(this._mcpService.servers).filter(s => s.collection.id === collection.id);
			for (const node of serversNode.children || []) {
				if (node.type !== 'property' || node.children?.[0]?.type !== 'string') {
					continue;
				}

				const name = node.children[0].value as string;

				const server = mcpServers.find(s => s.definition.label === name);
				if (!server) {
					continue;
				}

				const range = Range.fromPositions(model.getPositionAt(node.children[0].offset));

				if (isContributionDisabled(read(server.enablement))) {
					lenses.push({
						range,
						command: {
							id: McpCommandIds.ServerOptions,
							title: '$(circle-slash) ' + localize('server.disabled', 'Disabled'),
							arguments: [server.definition.id],
						},
					});
					continue;
				}

				const canDebug = !!server.readDefinitions().get().server?.devMode?.debug;
				const state = read(server.connectionState).state;
				switch (state) {
					case McpConnectionState.Kind.Error:
						lenses.push({
							range,
							command: {
								id: McpCommandIds.ShowOutput,
								title: '$(error) ' + localize('server.error', 'Error'),
								arguments: [server.definition.id],
							},
						}, {
							range,
							command: {
								id: McpCommandIds.RestartServer,
								title: localize('mcp.restart', "Restart"),
								arguments: [server.definition.id, { autoTrustChanges: true } satisfies IMcpServerStartOpts],
							},
						});
						if (canDebug) {
							lenses.push({
								range,
								command: {
									id: McpCommandIds.RestartServer,
									title: localize('mcp.debug', "Debug"),
									arguments: [server.definition.id, { debug: true, autoTrustChanges: true } satisfies IMcpServerStartOpts],
								},
							});
						}
						break;
					case McpConnectionState.Kind.Starting:
						lenses.push({
							range,
							command: {
								id: McpCommandIds.ShowOutput,
								title: '$(loading~spin) ' + localize('server.starting', 'Starting'),
								arguments: [server.definition.id],
							},
						}, {
							range,
							command: {
								id: McpCommandIds.StopServer,
								title: localize('cancel', "Cancel"),
								arguments: [server.definition.id],
							},
						});
						break;
					case McpConnectionState.Kind.Running:
						lenses.push({
							range,
							command: {
								id: McpCommandIds.ShowOutput,
								title: '$(check) ' + localize('server.running', 'Running'),
								arguments: [server.definition.id],
							},
						}, {
							range,
							command: {
								id: McpCommandIds.StopServer,
								title: localize('mcp.stop', "Stop"),
								arguments: [server.definition.id],
							},
						}, {
							range,
							command: {
								id: McpCommandIds.RestartServer,
								title: localize('mcp.restart', "Restart"),
								arguments: [server.definition.id, { autoTrustChanges: true } satisfies IMcpServerStartOpts],
							},
						});
						if (canDebug) {
							lenses.push({
								range,
								command: {
									id: McpCommandIds.RestartServer,
									title: localize('mcp.debug', "Debug"),
									arguments: [server.definition.id, { autoTrustChanges: true, debug: true } satisfies IMcpServerStartOpts],
								},
							});
						}
						break;
					case McpConnectionState.Kind.Stopped:
						lenses.push({
							range,
							command: {
								id: McpCommandIds.StartServer,
								title: '$(debug-start) ' + localize('mcp.start', "Start"),
								arguments: [server.definition.id, { autoTrustChanges: true } satisfies IMcpServerStartOpts],
							},
						});
						if (canDebug) {
							lenses.push({
								range,
								command: {
									id: McpCommandIds.StartServer,
									title: localize('mcp.debug', "Debug"),
									arguments: [server.definition.id, { autoTrustChanges: true, debug: true } satisfies IMcpServerStartOpts],
								},
							});
						}
				}

				if (state !== McpConnectionState.Kind.Error) {
					const toolCount = read(server.tools).length;
					if (toolCount) {
						lenses.push({
							range,
							command: {
								id: '',
								title: localize('server.toolCount', '{0} tools', toolCount),
							}
						});
					}

					const promptCount = read(server.prompts).length;
					if (promptCount) {
						lenses.push({
							range,
							command: {
								id: McpCommandIds.StartPromptForServer,
								title: localize('server.promptcount', '{0} prompts', promptCount),
								arguments: [server],
							}
						});
					}

					lenses.push({
						range,
						command: {
							id: McpCommandIds.ServerOptions,
							title: localize('mcp.server.more', 'More...'),
							arguments: [server.definition.id],
						}
					});
				}
			}
		}

		// Add "Set/Replace Client Secret" lenses for servers that have oauth.clientId configured.
		// Collect candidates first, then batch-resolve secrets with Promise.all to avoid
		// sequential awaits for each server (which would slow CodeLens on larger mcp.json files).
		type SecretCandidate = { clientId: string; mcpServerUrl: string; serverName: string; clientIdOffset: number };
		const candidates: SecretCandidate[] = [];
		for (const node of serversNode.children || []) {
			if (node.type !== 'property' || node.children?.[0]?.type !== 'string' || !node.children[1]) {
				continue;
			}
			const serverName = node.children[0].value as string;
			const serverValue = node.children[1];
			const clientIdNode = findNodeAtLocation(serverValue, ['oauth', 'clientId']);
			if (clientIdNode && clientIdNode.type === 'string') {
				const clientId = clientIdNode.value as string;
				if (clientId) {
					const urlNode = findNodeAtLocation(serverValue, ['url']);
					const rawUrl = urlNode && urlNode.type === 'string' ? urlNode.value as string : undefined;
					if (!rawUrl) {
						continue; // OAuth only meaningful for HTTP servers, which require url
					}
					// Canonicalize to match the runtime key (URI.parse normalizes authority casing, etc.)
					let mcpServerUrl: string;
					try {
						mcpServerUrl = URI.parse(rawUrl).toString(true);
					} catch {
						continue; // malformed URL, skip
					}
					candidates.push({ clientId, mcpServerUrl, serverName, clientIdOffset: clientIdNode.offset });
				}
			}
		}
		const existingSecrets = await Promise.all(
			candidates.map(c => this._secretStorageService.get(mcpOAuthClientSecretStorageKey(c.mcpServerUrl, c.clientId)))
		);
		for (let i = 0; i < candidates.length; i++) {
			const { clientId, mcpServerUrl, serverName, clientIdOffset } = candidates[i];
			const existing = existingSecrets[i];
			const title = existing
				? localize('mcp.replaceClientSecret', "Replace Client Secret")
				: localize('mcp.setClientSecret', "Set Client Secret");
			lenses.push({
				range: Range.fromPositions(model.getPositionAt(clientIdOffset)),
				command: {
					id: McpCommandIds.SetOAuthClientSecret,
					title,
					arguments: [clientId, mcpServerUrl, serverName],
				},
			});
		}

		return lensList;
	}

	private _addAgentHostServerCodeLenses(lenses: CodeLens[], range: Range, agentHostSession: URI, server: AgentHostMcpServer, otherRunningSessionCount: number): void {
		const commandArg = { agentHostSession, serverId: server.id };
		if (!server.enabled) {
			lenses.push({
				range,
				command: {
					id: McpCommandIds.AgentHostServerOptions,
					title: '$(circle-slash) ' + localize('server.disabled', 'Disabled'),
					arguments: [agentHostSession, server.id],
				},
			});
			return;
		}

		switch (server.status) {
			case McpServerStatus.Error:
				lenses.push({
					range,
					command: {
						id: McpCommandIds.AgentHostServerOptions,
						title: '$(error) ' + localize('server.error', 'Error'),
						arguments: [agentHostSession, server.id],
					},
				});
				lenses.push({
					range,
					command: {
						id: McpCommandIds.StartServer,
						title: localize('mcp.start', "Start"),
						arguments: [commandArg],
					},
				});
				break;
			case McpServerStatus.Starting:
				lenses.push({
					range,
					command: {
						id: McpCommandIds.AgentHostServerOptions,
						title: '$(loading~spin) ' + localize('server.starting', 'Starting'),
						arguments: [agentHostSession, server.id],
					},
				});
				lenses.push({
					range,
					command: {
						id: McpCommandIds.StopServer,
						title: localize('cancel', "Cancel"),
						arguments: [commandArg],
					},
				});
				break;
			case McpServerStatus.Ready:
				lenses.push({
					range,
					command: {
						id: McpCommandIds.AgentHostServerOptions,
						title: '$(check) ' + localize('server.running', 'Running'),
						arguments: [agentHostSession, server.id],
					},
				});
				lenses.push({
					range,
					command: {
						id: McpCommandIds.StopServer,
						title: localize('mcp.stop', "Stop"),
						arguments: [commandArg],
					},
				});
				break;
			case McpServerStatus.AuthRequired:
				lenses.push({
					range,
					command: {
						id: McpCommandIds.AgentHostServerOptions,
						title: '$(account) ' + localize('server.authRequired', 'Authentication Required'),
						arguments: [agentHostSession, server.id],
					},
				});
				lenses.push({
					range,
					command: {
						id: McpCommandIds.StopServer,
						title: localize('mcp.stop', "Stop"),
						arguments: [commandArg],
					},
				});
				break;
			case McpServerStatus.Stopped:
				lenses.push({
					range,
					command: {
						id: McpCommandIds.StartServer,
						title: '$(debug-start) ' + localize('mcp.start', "Start"),
						arguments: [commandArg],
					},
				});
				break;
		}

		if (otherRunningSessionCount > 0) {
			lenses.push({
				range,
				command: {
					id: '',
					title: otherRunningSessionCount === 1
						? localize('server.runningInOneOtherSession', '(Running in 1 session)')
						: localize('server.runningInOtherSessions', '(Running in {0} sessions)', otherRunningSessionCount),
				}
			});
		}

		if (server.status !== McpServerStatus.Error) {
			lenses.push({
				range,
				command: {
					id: McpCommandIds.AgentHostServerOptions,
					title: localize('mcp.server.more', 'More...'),
					arguments: [agentHostSession, server.id],
				}
			});
		}
	}

	private _getOtherRunningAgentHostMcpServerCounts(agentHostSession: URI): Map<string, number> {
		const sessionServers: IMcpEditorAgentHostSessionServers[] = [];
		for (const connectionInfo of this._agentHostConnectionsService.connections) {
			const connection = connectionInfo.connection;
			if (!connection) {
				continue;
			}

			for (const subscription of connection.getActiveSubscriptions()) {
				if (subscription.kind !== StateComponents.Session) {
					continue;
				}

				const state = connection.getSubscriptionUnmanaged(StateComponents.Session, subscription.resource)?.value;
				const resource = this._toAgentHostSessionResource(connectionInfo, subscription.resource);
				if (!resource || !state || state instanceof Error) {
					continue;
				}

				sessionServers.push({ resource, servers: this._getMcpServersFromSessionState(state) });
			}
		}
		return countRunningMcpServersInOtherSessions(agentHostSession, sessionServers);
	}

	private _toAgentHostSessionResource(connectionInfo: IAgentHostConnectionInfo, backendSession: URI): URI | undefined {
		const provider = AgentSession.provider(backendSession);
		if (!provider) {
			return undefined;
		}
		const scheme = connectionInfo.isAmbient
			? `${LOCAL_AGENT_HOST_SCHEME_PREFIX}${provider}`
			: remoteAgentHostSessionTypeId(connectionInfo.authority, provider);
		return URI.from({ scheme, path: backendSession.path });
	}

	private _getMcpServersFromSessionState(state: SessionState): IMcpEditorAgentHostServer[] {
		const servers: IMcpEditorAgentHostServer[] = [];
		const collect = (customizations: readonly (Customization | ChildCustomization)[] | undefined) => {
			for (const customization of customizations ?? []) {
				if (customization.type === CustomizationType.McpServer) {
					servers.push({
						name: customization.name,
						enabled: customization.enabled,
						status: customization.state.kind,
					});
				} else if (customization.type === CustomizationType.Directory || customization.type === CustomizationType.Plugin) {
					collect(customization.children);
				}
			}
		};
		collect(state.customizations);
		return servers;
	}

	private async _provideInlayHints(model: ITextModel, range: Range): Promise<InlayHintList | undefined> {
		const parsed = await this._parseModel(model);
		if (!parsed) {
			return undefined;
		}

		const { tree, inConfig } = parsed;
		const mcpSection = inConfig.section ? findNodeAtLocation(tree, [...inConfig.section]) : tree;
		if (!mcpSection) {
			return undefined;
		}

		const inputsNode = findNodeAtLocation(mcpSection, ['inputs']);
		if (!inputsNode) {
			return undefined;
		}

		const inputs = await this._mcpRegistry.getSavedInputs(inConfig.scope);
		const hints: InlayHint[] = [];

		const serversNode = findNodeAtLocation(mcpSection, [inConfig.serversKey ?? 'servers']);
		if (serversNode) {
			annotateServers(serversNode);
		}
		annotateInputs(inputsNode);

		return { hints, dispose: () => { } };

		function annotateServers(servers: Node) {
			forEachPropertyWithReplacement(servers, node => {
				const expr = ConfigurationResolverExpression.parse(node.value);
				for (const { id } of expr.unresolved()) {
					const saved = inputs[id];
					if (saved) {
						pushAnnotation(id, node.offset + node.value.indexOf(id) + id.length, saved);
					}
				}
			});
		}

		function annotateInputs(node: Node) {
			if (node.type !== 'array' || !node.children) {
				return;
			}

			for (const input of node.children) {
				if (input.type !== 'object' || !input.children) {
					continue;
				}

				const idProp = input.children.find(c => c.type === 'property' && c.children?.[0].value === 'id');
				if (!idProp) {
					continue;
				}

				const id = idProp.children![1];
				if (!id || id.type !== 'string' || !id.value) {
					continue;
				}

				const savedId = '${input:' + id.value + '}';
				const saved = inputs[savedId];
				if (saved) {
					pushAnnotation(savedId, id.offset + 1 + id.length, saved);
				}
			}
		}

		function pushAnnotation(savedId: string, offset: number, saved: IResolvedValue): InlayHint {
			const tooltip = new MarkdownString([
				createMarkdownCommandLink({ id: McpCommandIds.EditStoredInput, text: localize('edit', 'Edit'), arguments: [savedId, model.uri, mcpConfigurationSection, inConfig!.target], tooltip: localize('edit.savedValue.tooltip', 'Edit saved value') }),
				createMarkdownCommandLink({ id: McpCommandIds.RemoveStoredInput, text: localize('clear', 'Clear'), arguments: [inConfig!.scope, savedId], tooltip: localize('clear.savedValue.tooltip', 'Clear saved value') }),
				createMarkdownCommandLink({ id: McpCommandIds.RemoveStoredInput, text: localize('clearAll', 'Clear All'), arguments: [inConfig!.scope], tooltip: localize('clearAll.savedValues.tooltip', 'Clear all saved values') }),
			].join(' | '), { isTrusted: true });

			const hint: InlayHint = {
				label: '= ' + (saved.input?.type === 'promptString' && saved.input.password ? '*'.repeat(10) : (saved.value || '')),
				position: model.getPositionAt(offset),
				tooltip,
				paddingLeft: true,
			};

			hints.push(hint);
			return hint;
		}
	}
}



function forEachPropertyWithReplacement(node: Node, callback: (node: Node) => void) {
	if (node.type === 'string' && typeof node.value === 'string' && node.value.includes(ConfigurationResolverExpression.VARIABLE_LHS)) {
		callback(node);
	} else if (node.type === 'property') {
		// skip the property name
		node.children?.slice(1).forEach(n => forEachPropertyWithReplacement(n, callback));
	} else {
		node.children?.forEach(n => forEachPropertyWithReplacement(n, callback));
	}
}
