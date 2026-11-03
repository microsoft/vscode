/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { findNodeAtLocation, Node, parseTree } from '../../../../../base/common/json.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { getLeadingWhitespace } from '../../../../../base/common/strings.js';
import { isString } from '../../../../../base/common/types.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IEditorModel } from '../../../../../editor/common/editorCommon.js';
import { registerEditorFeature } from '../../../../../editor/common/editorFeatures.js';
import { CodeLens, CodeLensList, CodeLensProvider } from '../../../../../editor/common/languages.js';
import { isITextModel, ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { showToolsPicker } from '../actions/chatToolPicker.js';

/**
 * Provides a "Configure Tools..." code lens above the `tools` array of every
 * tool set defined in a `.toolsets.jsonc` file. Clicking the lens opens the
 * shared tools picker seeded with the currently referenced tools and writes the
 * new selection back into the array using qualified reference names.
 */
class ToolSetsCodeLensProvider extends Disposable implements CodeLensProvider {

	// `_`-prefix marks this as private command
	private readonly cmdId = `_configureToolSetTools/${generateUuid()}`;

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(this.languageFeaturesService.codeLensProvider.register({ language: 'jsonc' }, this));

		this._register(CommandsRegistry.registerCommand(this.cmdId, (_accessor, ...args) => {
			const modelArg = args[0] as IEditorModel;
			const rangeArg = args[1];
			const toolsArg = args[2];
			if (isITextModel(modelArg) && Range.isIRange(rangeArg) && Array.isArray(toolsArg) && toolsArg.every(isString)) {
				return this.updateTools(modelArg, Range.lift(rangeArg), toolsArg);
			}
			return undefined;
		}));
	}

	provideCodeLenses(model: ITextModel, _token: CancellationToken): CodeLensList | undefined {
		if (!model.uri.path.endsWith('.toolsets.jsonc')) {
			return undefined;
		}

		const root = parseTree(model.getValue());
		if (!root || root.type !== 'object' || !root.children) {
			return undefined;
		}

		const lenses: CodeLens[] = [];
		for (const property of root.children) {
			if (property.type !== 'property' || !property.children || property.children.length !== 2) {
				continue;
			}
			const [keyNode, valueNode] = property.children;
			if (valueNode.type !== 'object') {
				continue;
			}
			const toolsNode = findNodeAtLocation(valueNode, ['tools']);
			if (!toolsNode || toolsNode.type !== 'array') {
				continue;
			}

			const selectedTools = (toolsNode.children ?? [])
				.filter(item => item.type === 'string' && isString(item.value))
				.map(item => item.value as string);

			const keyStart = model.getPositionAt(keyNode.offset);
			const valueRange = this.rangeFromNode(model, toolsNode);

			lenses.push({
				range: Range.fromPositions(keyStart),
				command: {
					title: localize('configure-tools.capitalized.ellipsis', "Configure Tools..."),
					id: this.cmdId,
					arguments: [model, valueRange, selectedTools]
				}
			});
		}

		return { lenses };
	}

	private rangeFromNode(model: ITextModel, node: Node): Range {
		const start = model.getPositionAt(node.offset);
		const end = model.getPositionAt(node.offset + node.length);
		return Range.fromPositions(start, end);
	}

	private async updateTools(model: ITextModel, range: Range, selectedTools: readonly string[]): Promise<void> {
		const getToolsEntries = () => this.languageModelToolsService.toToolAndToolSetEnablementMap(selectedTools, undefined);
		const newSelected = await this.instantiationService.invokeFunction(showToolsPicker, localize('placeholder', "Select tools"), 'toolSetCodeLens', undefined, getToolsEntries);
		if (!newSelected) {
			return;
		}

		const newNames = this.languageModelToolsService.toFullReferenceNames(newSelected);
		const newValue = this.formatToolsArray(model, range, newNames);

		model.pushStackElement();
		model.pushEditOperations(null, [EditOperation.replaceMove(range, newValue)], () => null);
		model.pushStackElement();
	}

	private formatToolsArray(model: ITextModel, range: Range, toolNames: readonly string[]): string {
		if (toolNames.length === 0) {
			return '[]';
		}

		const { insertSpaces, indentSize } = model.getOptions();
		const oneIndent = insertSpaces ? ' '.repeat(indentSize) : '\t';
		const baseIndent = getLeadingWhitespace(model.getLineContent(range.startLineNumber));
		const itemIndent = baseIndent + oneIndent;

		const items = toolNames.map(name => `${itemIndent}${JSON.stringify(name)}`).join(',\n');
		return `[\n${items}\n${baseIndent}]`;
	}
}

registerEditorFeature(ToolSetsCodeLensProvider);
