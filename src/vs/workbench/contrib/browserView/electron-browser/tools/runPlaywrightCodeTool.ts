/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { errorResult } from './browserToolHelpers.js';
import { OpenPageToolId } from './openBrowserTool.js';

export const RunPlaywrightCodeToolData: IToolData = {
	id: 'run_playwright_code',
	toolReferenceName: 'runPlaywrightCode',
	displayName: localize('runPlaywrightCodeTool.displayName', 'Run Playwright Code'),
	userDescription: localize('runPlaywrightCodeTool.userDescription', 'Run a Playwright code snippet against a browser page'),
	modelDescription: `Run a Playwright code snippet to control a browser page. Only use this if other browser tools are insufficient.`,
	icon: Codicon.terminal,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			pageId: {
				type: 'string',
				description: `The browser page ID, acquired from context or the open tool.`
			},
			code: {
				type: 'string',
				description: `The Playwright code to execute. The code must be concise, serve one clear purpose, and be self-contained. You **must not** directly access \`document\` or \`window\` using this tool. You must access it via the provided \`page\` object, e.g. "return page.evaluate(() => document.title)".`
			},
		},
		required: ['pageId', 'code'],
	},
};

interface IRunPlaywrightCodeToolParams {
	pageId: string;
	code: string;
}

export class RunPlaywrightCodeTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as IRunPlaywrightCodeToolParams;
		const code = params.code ?? '';
		return {
			invocationMessage: new MarkdownString(localize('browser.runCode.invocation', "Running Playwright code...")),
			pastTenseMessage: new MarkdownString(localize('browser.runCode.past', "Ran Playwright code")),
			confirmationMessages: {
				title: localize('browser.runCode.confirmTitle', 'Run Playwright Code?'),
				message: new MarkdownString(`\`\`\`javascript\n${code.trim()}\n\`\`\``),
				disclaimer: localize('browser.runCode.confirmDisclaimer', 'Make sure you trust the code before continuing.'),
				allowAutoConfirm: true,
			}
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IRunPlaywrightCodeToolParams;

		if (!params.pageId) {
			return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
		}

		if (!params.code) {
			return errorResult('The "code" parameter is required.');
		}

		let result;
		try {
			result = await this.playwrightService.invokeFunction(params.pageId, `async (page) => { ${params.code} }`);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return errorResult(`Code execution failed: ${message}`);
		}

		const json = JSON.stringify(result.result || null);

		let outputMessage;
		if (result.result) {
			outputMessage = new MarkdownString();
			outputMessage.appendMarkdown(localize('browser.runCode.outputLabel', 'Output:'));
			outputMessage.appendText('\n');
			outputMessage.appendCodeblock('json', json);
		}

		return {
			content: [
				{ kind: 'text', value: result.result ? json : 'Code executed successfully' },
				{ kind: 'text', value: result.summary }
			],
			toolResultDetails: {
				input: params.code.trim(),
				output: result.result
					? [{ type: 'embed', isText: true, value: JSON.stringify(result.result, null, 2) }]
					: [],
				isError: false,
			},
		};
	}
}
