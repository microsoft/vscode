/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { logRunPlaywrightCode } from '../../../../../platform/browserView/common/browserViewTelemetry.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { errorResult, getSessionId, invokeFunctionResultToToolResult } from './browserToolHelpers.js';
import { BrowserChatToolReferenceName } from '../../common/browserChatToolReferenceNames.js';
import { OpenPageToolId } from './openBrowserTool.js';

export const RunPlaywrightCodeToolData: IToolData = {
	id: 'run_playwright_code',
	toolReferenceName: BrowserChatToolReferenceName.RunPlaywrightCode,
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
				description: `The Playwright code to execute. The code must be concise, serve one clear purpose, and be self-contained. You **must not** directly access \`document\` or \`window\` using this tool. You must access it via the provided \`page\` object, e.g. "return page.evaluate(() => document.title)". Omit this when resuming a deferred execution via deferredResultId.`
			},
			deferredResultId: {
				type: 'string',
				description: `If a previous call returned a deferredResultId, pass it here to continue waiting for that execution to complete.`
			},
			timeoutMs: {
				type: 'number',
				description: `Maximum time in milliseconds to wait for the code to complete. Defaults to 5000 (5 seconds).`
			},
		},
		required: ['pageId'],
		$comment: 'Either "code" or "deferredResultId" must be provided.',
	},
};

interface IRunPlaywrightCodeToolParams {
	pageId: string;
	code?: string;
	deferredResultId?: string;
	timeoutMs?: number;
}

export class RunPlaywrightCodeTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as IRunPlaywrightCodeToolParams;

		if (params.deferredResultId) {
			return {
				invocationMessage: new MarkdownString(localize('browser.runCode.waitInvocation', "Waiting for Playwright code to complete...")),
				pastTenseMessage: new MarkdownString(localize('browser.runCode.waitPast', "Waited for Playwright code")),
			};
		}

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
		const sessionId = getSessionId(invocation);

		if (!params.pageId) {
			return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
		}

		const wasDeferred = !!params.deferredResultId;
		// Resumed deferred calls don't carry the original code; its size was
		// already logged by the initial invocation, so report 0 here to match
		// the documented telemetry schema.
		const codeLength = wasDeferred ? 0 : (params.code?.length ?? 0);
		const codeLineCount = wasDeferred ? 0 : (params.code ? params.code.split('\n').length : 0);
		const startedAt = Date.now();

		// Resume waiting for a deferred execution.
		if (wasDeferred) {
			try {
				const result = await this.playwrightService.waitForDeferredResult(sessionId, params.deferredResultId!, params.timeoutMs ?? 5_000);
				this._logTelemetry(result, { wasDeferred, codeLength, codeLineCount, durationMs: Date.now() - startedAt });
				return invokeFunctionResultToToolResult(result);
			} catch (e) {
				this._logInvocationFailureTelemetry({ wasDeferred, codeLength, codeLineCount, durationMs: Date.now() - startedAt });
				return errorResult(e instanceof Error ? e.message : String(e));
			}
		}

		if (!params.code) {
			return errorResult('Either "code" or "deferredResultId" must be provided.');
		}

		let result;
		try {
			result = await this.playwrightService.invokeFunction(sessionId, params.pageId, `async (page) => { ${params.code} }`, undefined, params.timeoutMs ?? 5_000);
		} catch (e) {
			this._logInvocationFailureTelemetry({ wasDeferred, codeLength, codeLineCount, durationMs: Date.now() - startedAt });
			const message = e instanceof Error ? e.message : String(e);
			return errorResult(`Code execution failed: ${message}`);
		}

		this._logTelemetry(result, { wasDeferred, codeLength, codeLineCount, durationMs: Date.now() - startedAt });
		return invokeFunctionResultToToolResult(result, params.code.trim());
	}

	private _logTelemetry(
		result: { error?: string; deferredResultId?: string; pageMethodsCalled?: Readonly<Record<string, number>> },
		ctx: { wasDeferred: boolean; codeLength: number; codeLineCount: number; durationMs: number }
	): void {
		// Skip in-progress deferred runs so each user-visible invocation produces
		// at most one event (we'll log when the resumed call eventually settles).
		if (result.deferredResultId) {
			return;
		}
		logRunPlaywrightCode(this.telemetryService, {
			pageMethodsCalled: result.pageMethodsCalled ?? {},
			success: !result.error,
			wasDeferred: ctx.wasDeferred,
			durationMs: ctx.durationMs,
			codeLength: ctx.codeLength,
			codeLineCount: ctx.codeLineCount,
		});
	}

	private _logInvocationFailureTelemetry(ctx: { wasDeferred: boolean; codeLength: number; codeLineCount: number; durationMs: number }): void {
		// Infrastructure failure (IPC threw, no result available). API-usage
		// data lives in the shared process and is lost in this case.
		logRunPlaywrightCode(this.telemetryService, {
			pageMethodsCalled: {},
			success: false,
			wasDeferred: ctx.wasDeferred,
			durationMs: ctx.durationMs,
			codeLength: ctx.codeLength,
			codeLineCount: ctx.codeLineCount,
		});
	}
}
