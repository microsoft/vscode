/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ICodeUsageService } from './usagesService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../common/tools/languageModelToolsService.js';
import { errorResult } from './toolHelpers.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
import type { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';


export const UsagesReadToolId = 'vscode_readCodeUsage';

const BaseModelDescription = `Read the source code of a syntactic scope around a usage returned by \`vscode_listCodeUsages\`.

Use this — not \`read_file\` — whenever you want to see the code around a usage in a \`vscode_listCodeUsages\` result. The scope ranges are pre-computed
from the language service, so this tool returns exactly the lines needed to understand the usage in context, with no guessing about line numbers.

Inputs:
- \`usageId\` (string, required): the \`usageId\` of a usage from a recent \`vscode_listCodeUsages\` result.
- \`depth\` (integer, optional, default 0): which enclosing scope to read.
	- \`0\` = innermost scope (e.g. the function or method containing the usage). Start here.
	- \`1\` = next scope outward (e.g. the enclosing class).
	- \`2\`, \`3\`, ... = progressively wider scopes, as listed in the usage's \`scopes\` array.

When to increase \`depth\`:
- Always call with \`depth: 0\` first.
- Only call again with \`depth: 1\` if the innermost scope was genuinely insufficient to answer your question — for example, the usage refers to a field or helper defined elsewhere in the same class.
- Continue incrementing only as needed. **DO NOT** skip ahead to a larger depth "to be safe".

- Output:
- \`file\` — workspace-relative path of the source file.
- \`scope\` — human-readable label of the scope being returned (e.g. \`method Server.start\`).
- \`startLine\`, \`endLine\` — 1-based inclusive line range covered by the returned content.
- \`content\` — the source text of that range.
- \`hasWiderScope\` — \`true\` if a larger scope is available at \`depth + 1\`.
`;

const StaticModelDescription = BaseModelDescription + `

If the \`usageId\` is invalid, the tool returns an error.`;

interface IUsagesReadToolInput {
	usageId: string;
	depth?: number;
}

namespace IUsagesReadToolInput {
	export function is(value: unknown): value is IUsagesReadToolInput {
		const candidate = value as IUsagesReadToolInput;
		return typeof candidate === 'object'
			&& candidate !== null
			&& typeof candidate.usageId === 'string'
			&& (typeof candidate.depth === 'undefined' || typeof candidate.depth === 'number');
	}
}

interface IUsagesReadToolOutput {
	uri: string;
	scope: string;
	startLine: number;
	endLine: number;
	content: string;
	hasWiderScope: boolean;
}

export class UsagesReadTool extends Disposable implements IToolImpl {

	constructor(
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ICodeUsageService private readonly _codeUsageService: ICodeUsageService,
	) {
		super();
	}

	getToolData(): IToolData {
		return this._buildToolData(
			StaticModelDescription,
			localize('tool.readUsage.userDescription', 'Read the source code of a syntactic scope around a usage returned by \`vscode_listCodeUsages\`'),
		);
	}

	private _buildToolData(modelDescription: string, userDescription: string): IToolData {
		return {
			id: UsagesReadToolId,
			toolReferenceName: 'read_code_usage',
			canBeReferencedInPrompt: false,
			icon: ThemeIcon.fromId(Codicon.tools.id),
			displayName: localize('tool.readUsages.displayName', 'Read Code Usage'),
			userDescription,
			modelDescription,
			source: ToolDataSource.Internal,
			inputSchema: {
				type: 'object',
				properties: {
					usageId: {
						type: 'string',
						description: 'The unique identifier of the usage to read, previously returned by the list code usages tool.'
					},
					depth: {
						type: 'number',
						description: 'The depth of the scope to read. Optional.'
					}
				},
				required: ['usageId']
			},
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const input = context.parameters as IUsagesReadToolInput;
		return {
			invocationMessage: localize('tool.readUsages.invocationMessage', 'Reading file content for usage `{0}`', input.usageId),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const input = invocation.parameters;
		if (!IUsagesReadToolInput.is(input)) {
			return errorResult(localize('tool.readUsages.invalidInput', 'Invalid input for Read Code Usage tool'));
		}
		const usage = this._codeUsageService.getUsage(input.usageId);
		if (!usage) {
			return errorResult(localize('tool.readUsages.usageNotFound', 'No usage found for id {0}', input.usageId));
		}
		const depth = input.depth ?? 0;
		if (depth < 0 || depth >= (usage.containers?.length ?? 0)) {
			return errorResult(localize('tool.readUsages.invalidDepth', 'Invalid depth {0} for usage with {1} container(s)', depth, usage.containers?.length ?? 0));
		}
		const container = usage.containers?.[depth];
		if (!container) {
			return errorResult(localize('tool.readUsages.noContainer', 'No container found at depth {0} for usage', depth));
		}
		const uri = URI.revive(usage.uri);
		const startLine = container.range.startLine;
		const endLine = container.range.endLine;
		const model = await this._textModelService.createModelReference(uri).then(ref => ref.object);
		const textModel = model.textEditorModel;
		const content = textModel.getValueInRange({
			startLineNumber: startLine,
			startColumn: 1,
			endLineNumber: endLine,
			endColumn: textModel.getLineMaxColumn(endLine)
		});
		const output: IUsagesReadToolOutput = {
			uri: uri.toString(),
			scope: `${container.kind} ${container.name}`,
			startLine,
			endLine,
			content,
			hasWiderScope: depth < (usage.containers?.length ?? 0) - 1
		};
		const result = createToolSimpleTextResult(JSON.stringify(output, null, '\t'));
		result.toolResultMessage = localize('tool.readUsages.resultMessage', 'Read usage {0} in scope {1}', input.usageId, container.name);
		return result;
	}
}

export class UsagesReadToolContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.usagesReadTool';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const usagesReadTool = this._store.add(instantiationService.createInstance(UsagesReadTool));
		this._store.add(toolsService.registerTool(usagesReadTool.getToolData(), usagesReadTool));
	}
}
