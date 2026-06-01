/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
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

/** Size metrics for a code snippet, reported in telemetry. */
interface ICodeMetrics {
	codeLength: number;
	codeLineCount: number;
}

/** Context shared by the telemetry log helpers for a single invocation. */
interface ILogContext extends ICodeMetrics {
	wasDeferred: boolean;
	/** {@link Date.now} timestamp captured when the invocation began. */
	startedAt: number;
}

/** Measure the size of a code snippet. */
function measureCode(code: string | undefined): ICodeMetrics {
	return {
		codeLength: code?.length ?? 0,
		codeLineCount: code ? code.split('\n').length : 0,
	};
}

export class RunPlaywrightCodeTool implements IToolImpl {
	/**
	 * Code-size metrics carried from the initiating call of a deferred execution
	 * to its resume(s), keyed by `deferredResultId`. A deferred execution is
	 * logged exactly once - when it finally settles on a resume - but resumes
	 * don't carry the original `code`, so we stash its size here when the
	 * execution first defers and recover it on settle.
	 */
	private readonly _deferredCodeMetrics = new Map<string, ICodeMetrics>();

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
		// A deferred execution is logged once, when it finally settles on a resume.
		// Resumes don't carry the original `code`, so recover the size captured when
		// the execution first deferred; otherwise measure whatever code we were given.
		const carried = params.deferredResultId ? this._deferredCodeMetrics.get(params.deferredResultId) : undefined;
		const codeMetrics = carried ?? measureCode(params.code);
		const ctx = { wasDeferred, startedAt: Date.now(), ...codeMetrics };

		// Resume waiting for a deferred execution.
		if (wasDeferred) {
			try {
				const result = await this.playwrightService.waitForDeferredResult(sessionId, params.deferredResultId!, params.timeoutMs ?? 5_000);
				this._trackDeferral(result, codeMetrics, params.deferredResultId);
				this._logTelemetry(ctx, result);
				return invokeFunctionResultToToolResult(result);
			} catch (e) {
				this._deferredCodeMetrics.delete(params.deferredResultId!);
				this._logTelemetry(ctx);
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
			this._logTelemetry(ctx);
			return errorResult(`Code execution failed: ${e instanceof Error ? e.message : String(e)}`);
		}

		this._trackDeferral(result, codeMetrics);
		this._logTelemetry(ctx, result);
		return invokeFunctionResultToToolResult(result, params.code.trim());
	}

	/**
	 * Maintain the carry-forward code metrics across a deferred execution: drop
	 * the entry for the call we just resumed (if any) and, when the execution
	 * defers (again), stash the metrics under the new deferral id so the eventual
	 * settle can report the original code size.
	 */
	private _trackDeferral(result: { deferredResultId?: string }, metrics: ICodeMetrics, resumedDeferredId?: string): void {
		if (resumedDeferredId) {
			this._deferredCodeMetrics.delete(resumedDeferredId);
		}
		if (result.deferredResultId) {
			this._deferredCodeMetrics.set(result.deferredResultId, metrics);
		}
	}

	/**
	 * Log telemetry about a completed run_playwright_code invocation, recording
	 * which parts of the Playwright `page` API were used (with per-method call
	 * counts) along with success and timing signals.
	 *
	 * Omit `result` for infrastructure failures (IPC threw, no result available);
	 * the API-usage data lives in the shared process and is lost in that case.
	 */
	private _logTelemetry(ctx: ILogContext, result?: { error?: string; deferredResultId?: string; pageMethodsCalled?: Readonly<Record<string, number>> }): void {
		// Skip in-progress deferred runs so each user-visible invocation produces
		// at most one event (we'll log when the resumed call eventually settles).
		if (result?.deferredResultId) {
			return;
		}
		const pageMethodsCalled = result?.pageMethodsCalled ?? {};
		const entries = Object.entries(pageMethodsCalled);
		const total = entries.reduce((sum, [, count]) => sum + count, 0);
		this.telemetryService.publicLog2<RunPlaywrightCodeEvent, RunPlaywrightCodeClassification>(
			'integratedBrowser.tools.runPlaywrightCode.completed',
			{
				pageMethodsCalled: JSON.stringify(pageMethodsCalled),
				pageMethodsCalledDcount: entries.length,
				pageMethodsCalledCount: total,
				success: result && !result.error ? 1 : 0,
				wasDeferred: ctx.wasDeferred ? 1 : 0,
				durationMs: Math.round(Date.now() - ctx.startedAt),
				codeLength: ctx.codeLength,
				codeLineCount: ctx.codeLineCount,
			}
		);
	}
}

type RunPlaywrightCodeEvent = {
	pageMethodsCalled: string;
	pageMethodsCalledDcount: number;
	pageMethodsCalledCount: number;
	success: number;
	wasDeferred: number;
	durationMs: number;
	codeLength: number;
	codeLineCount: number;
};

type RunPlaywrightCodeClassification = {
	pageMethodsCalled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'JSON object mapping dotted `page.*` method names to call counts (e.g. `{"click":2,"keyboard.press":5}`), in first-observed order.' };
	pageMethodsCalledDcount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of distinct `page.*` methods invoked.' };
	pageMethodsCalledCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total method calls including duplicates (sum of all per-method counts).' };
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: '1 if the code completed without error, 0 otherwise.' };
	wasDeferred: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: '1 if this was a resumed deferred run, 0 otherwise.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock time in ms for this invocation.' };
	codeLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Character length of the executed code. For resumed deferred runs this is carried from the initiating call.' };
	codeLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Line count of the executed code. For resumed deferred runs this is carried from the initiating call.' };
	owner: 'jruales';
	comment: 'Tracks how the run_playwright_code chat tool is exercised so we can identify common patterns that should be promoted to dedicated browser tools.';
};
