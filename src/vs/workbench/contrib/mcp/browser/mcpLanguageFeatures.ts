/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { computeLevenshteinDistance } from '../../../../base/common/diff/diff.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { markdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { findNodeAtLocation, Node, parseTree } from '../../../../base/common/json.js';
import { Disposable, DisposableStore, dispose, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Range } from '../../../../editor/common/core/range.js';
import { CodeLens, CodeLensList, CodeLensProvider, InlayHint, InlayHintList } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../nls.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression, IResolvedValue } from '../../../services/configurationResolver/common/configurationResolverExpression.js';
import { McpCommandIds } from '../common/mcpCommandIds.js';
import { mcpConfigurationSection } from '../common/mcpConfiguration.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { IMcpConfigPath, IMcpServerStartOpts, IMcpService, IMcpWorkbenchService, McpConnectionState } from '../common/mcpTypes.js';

const diagnosticOwner = 'vscode.mcp';

export class McpLanguageFeatures extends Disposable implements IWorkbenchContribution {
	private readonly _cachedMcpSection = this._register(new MutableDisposable<{ model: ITextModel; inConfig: IMcpConfigPath; tree: Node } & IDisposable>());

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IMcpWorkbenchService private readonly _mcpWorkbenchService: IMcpWorkbenchService,
		@IMcpService private readonly _mcpService: IMcpService,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
	) {
		super();

		const patterns = [
			{ pattern: '**/mcp.json' },
			{ pattern: '**/workspace.json' },
		];

		const onDidChangeCodeLens = this._register(new Emitter<CodeLensProvider>());
		const codeLensProvider: CodeLensProvider = {
			onDidChange: onDidChangeCodeLens.event,
			provideCodeLenses: (model, range) => this._provideCodeLenses(model, () => onDidChangeCodeLens.fire(codeLensProvider)),
		};
		this._register(languageFeaturesService.codeLensProvider.register(patterns, codeLensProvider));

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
		const inConfig = await this._mcpWorkbenchService.getMcpConfigPath(model.uri);
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

	private _addDiagnostics(tm: ITextModel, value: string, tree: Node, inConfig: IMcpConfigPath) {
		const serversNode = findNodeAtLocation(tree, inConfig.section ? [...inConfig.section, 'servers'] : ['servers']);
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
		const serversNode = findNodeAtLocation(tree, inConfig.section ? [...inConfig.section, 'servers'] : ['servers']);
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

		return lensList;
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

		const serversNode = findNodeAtLocation(mcpSection, ['servers']);
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
				markdownCommandLink({ id: McpCommandIds.EditStoredInput, title: localize('edit', 'Edit'), arguments: [savedId, model.uri, mcpConfigurationSection, inConfig!.target] }),
				markdownCommandLink({ id: McpCommandIds.RemoveStoredInput, title: localize('clear', 'Clear'), arguments: [inConfig!.scope, savedId] }),
				markdownCommandLink({ id: McpCommandIds.RemoveStoredInput, title: localize('clearAll', 'Clear All'), arguments: [inConfig!.scope] }),
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


