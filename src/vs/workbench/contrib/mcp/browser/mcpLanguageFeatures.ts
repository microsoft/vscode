/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { markdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { findNodeAtLocation, Node, parseTree } from '../../../../base/common/json.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Range } from '../../../../editor/common/core/range.js';
import { CodeLensList, CodeLensProvider, InlayHint, InlayHintList } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ConfigurationResolverExpression, IResolvedValue } from '../../../services/configurationResolver/common/configurationResolverExpression.js';
import { IMcpConfigPathsService } from '../common/mcpConfigPathsService.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { IMcpService, McpConnectionState } from '../common/mcpTypes.js';
import { EditStoredInput, RemoveStoredInput, ShowOutput, StartServer, StopServer } from './mcpCommands.js';

export class McpLanguageFeatures extends Disposable implements IWorkbenchContribution {
	private readonly _cachedMcpSection = this._register(new MutableDisposable<{ model: ITextModel; node: Node } & IDisposable>());

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IMcpConfigPathsService private readonly _mcpConfigPathsService: IMcpConfigPathsService,
		@IMcpService private readonly _mcpService: IMcpService,
	) {
		super();

		const patterns = [{ pattern: '**/.vscode/mcp.json' }, { pattern: '**/settings.json' }];

		const onDidChangeCodeLens = this._register(new Emitter<CodeLensProvider>());
		const codeLensProvider: CodeLensProvider = {
			onDidChange: onDidChangeCodeLens.event,
			provideCodeLenses: (model, range) => this._provideCodeLenses(model, () => onDidChangeCodeLens.fire(codeLensProvider)),
		};
		this._register(languageFeaturesService.codeLensProvider.register(patterns, codeLensProvider));

		this._register(languageFeaturesService.inlayHintsProvider.register(patterns, {
			onDidChangeInlayHints: _mcpRegistry.onDidChangeInputs,
			provideInlayHints: (model, range) => this._provideInlayHints(model, range),
		}
		));
	}

	/** Simple mechanism to avoid extra json parsing for hints+lenses */
	private _parseModel(model: ITextModel) {
		if (this._cachedMcpSection.value?.model === model) {
			return this._cachedMcpSection.value.node;
		}

		const tree = parseTree(model.getValue());
		const listener = model.onDidChangeContent(() => this._cachedMcpSection.clear());
		this._cachedMcpSection.value = { model, node: tree, dispose: () => listener.dispose() };
		return tree;
	}

	private async _provideCodeLenses(model: ITextModel, onDidChangeCodeLens: () => void): Promise<CodeLensList | undefined> {
		const inConfig = this._mcpConfigPathsService.paths.find(u => isEqual(u.uri, model.uri));
		if (!inConfig) {
			return undefined;
		}

		const tree = this._parseModel(model);
		const serversNode = findNodeAtLocation(tree, inConfig.section ? [inConfig.section, 'servers'] : ['servers']);
		if (!serversNode) {
			return undefined;
		}

		const store = new DisposableStore();
		const lenses: CodeLensList = { lenses: [], dispose: () => store.dispose() };
		const read = <T>(observable: IObservable<T>): T => {
			store.add(Event.fromObservableLight(observable)(onDidChangeCodeLens));
			return observable.get();
		};

		const collection = read(this._mcpRegistry.collections).find(c => isEqual(c.presentation?.origin, model.uri));
		if (!collection) {
			return lenses;
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
			switch (read(server.connectionState).state) {
				case McpConnectionState.Kind.Error:
					lenses.lenses.push({
						range,
						command: {
							id: ShowOutput.ID,
							title: '$(error) ' + localize('server.error', 'Error'),
							arguments: [server.definition.id],
						},
					}, {
						range,
						command: {
							id: StartServer.ID,
							title: localize('mcp.restart', "Restart"),
							arguments: [server.definition.id],
						},
					});
					break;
				case McpConnectionState.Kind.Starting:
					lenses.lenses.push({
						range,
						command: {
							id: ShowOutput.ID,
							title: '$(loading~spin) ' + localize('server.starting', 'Starting'),
							arguments: [server.definition.id],
						},
					});
					break;
				case McpConnectionState.Kind.Running:
					lenses.lenses.push({
						range,
						command: {
							id: ShowOutput.ID,
							title: '$(check) ' + localize('server.running', 'Running'),
							arguments: [server.definition.id],
						},
					}, {
						range,
						command: {
							id: StopServer.ID,
							title: localize('mcp.stop', "Stop"),
							arguments: [server.definition.id],
						},
					}, {
						range,
						command: {
							id: StartServer.ID,
							title: localize('mcp.restart', "Restart"),
							arguments: [server.definition.id],
						},
					}, {
						range,
						command: {
							id: 'workbench.action.chat.attachTools',
							title: localize('server.toolCount', '{0} tools', read(server.tools).length),
						},
					});
					break;
				case McpConnectionState.Kind.Stopped:
					lenses.lenses.push({
						range,
						command: {
							id: StartServer.ID,
							title: '$(debug-start) ' + localize('mcp.start', "Start"),
							arguments: [server.definition.id],
						},
					});
			}
		}

		return lenses;
	}

	private async _provideInlayHints(model: ITextModel, range: Range): Promise<InlayHintList | undefined> {
		const inConfig = this._mcpConfigPathsService.paths.find(u => isEqual(u.uri, model.uri));
		if (!inConfig) {
			return undefined;
		}

		const tree = this._parseModel(model);
		const mcpSection = inConfig.section ? findNodeAtLocation(tree, [inConfig.section]) : tree;
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

		function annotateServers(node: Node) {
			if (node.type === 'string' && typeof node.value === 'string' && node.value.includes(ConfigurationResolverExpression.VARIABLE_LHS)) {
				const expr = ConfigurationResolverExpression.parse(node.value);
				for (const { id } of expr.unresolved()) {
					const saved = inputs[id];
					if (saved) {
						pushAnnotation(id, node.offset + node.value.indexOf(id) + id.length, '', saved);
					}
				}

			} else if (node.type === 'property') {
				// skip the property name
				node.children?.slice(1).forEach(annotateServers);
			} else {
				node.children?.forEach(annotateServers);
			}
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
					const hint = pushAnnotation(savedId, id.offset + 1 + id.length, localize('input', 'Value'), saved);
					hint.paddingLeft = true;
				}
			}
		}

		function pushAnnotation(savedId: string, offset: number, prefix: string, saved: IResolvedValue): InlayHint {
			const tooltip = new MarkdownString([
				markdownCommandLink({ id: EditStoredInput.ID, title: localize('edit', 'Edit'), arguments: [savedId, model.uri, inConfig!.section, inConfig!.target] }),
				markdownCommandLink({ id: RemoveStoredInput.ID, title: localize('clear', 'Clear'), arguments: [inConfig!.scope, savedId] }),
				markdownCommandLink({ id: RemoveStoredInput.ID, title: localize('clearAll', 'Clear All'), arguments: [inConfig!.scope] }),
			].join(' | '), { isTrusted: true });

			const hint: InlayHint = {
				label: prefix + ': ' + (saved.input?.type === 'promptString' && saved.input.password ? '*'.repeat(10) : (saved.value || '')),
				position: model.getPositionAt(offset),
				tooltip,
			};

			hints.push(hint);
			return hint;
		}
	}
}


