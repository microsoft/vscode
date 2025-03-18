/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { markdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { findNodeAtLocation, parseTree as jsonParseTree, Node } from '../../../../base/common/json.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Range } from '../../../../editor/common/core/range.js';
import { InlayHint, InlayHintList } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ConfigurationResolverExpression, IResolvedValue } from '../../../services/configurationResolver/common/configurationResolverExpression.js';
import { IMcpConfigPathsService } from '../common/mcpConfigPathsService.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { EditStoredInput, RemoveStoredInput } from './mcpCommands.js';

export class McpLanguageFeatures extends Disposable implements IWorkbenchContribution {
	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IMcpConfigPathsService private readonly _mcpConfigPathsService: IMcpConfigPathsService,
	) {
		super();

		this._register(languageFeaturesService.inlayHintsProvider.register(
			[{ pattern: '**/.vscode/mcp.json' }, { pattern: '**/settings.json' }],
			{
				onDidChangeInlayHints: _mcpRegistry.onDidChangeInputs,
				provideInlayHints: (model, range) => this._provideInlayHints(model, range),
			}
		));
	}

	private async _provideInlayHints(model: ITextModel, range: Range): Promise<InlayHintList | undefined> {
		const inConfig = this._mcpConfigPathsService.paths.find(u => isEqual(u.uri, model.uri));
		if (!inConfig) {
			return undefined;
		}

		const tree = jsonParseTree(model.getValue());
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


