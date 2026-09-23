/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { parse } from 'jsonc-parser';
import type * as vscode from 'vscode';
import { IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { isPreRelease } from '../../../platform/env/common/packagejson';
import { IResponseDelta } from '../../../platform/networking/common/fetch';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { extractCodeBlocks } from '../../../util/common/markdown';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Intent } from '../../common/constants';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo, IResponseProcessorContext } from '../../prompt/node/intents';
import { PseudoStopStartResponseProcessor } from '../../prompt/node/pseudoStartStopConversationCallback';
import { PromptRenderer, RendererIntentInvocation } from '../../prompts/node/base/promptRenderer';
import { SearchPrompt } from '../../prompts/node/panel/search';


export interface FindInFilesArgs {
	query: string;
	replace: string;
	filesToInclude: string;
	filesToExclude: string;
	isRegex: boolean;
	isCaseSensitive: boolean;
}

function createSearchFollowUps(args: any): vscode.Command[] {
	if (!args) {
		return [];
	}
	const searchResponses: vscode.Command[] = [];

	const searchArg: FindInFilesArgs = {
		query: args.query ?? '',
		replace: args.replace ?? '',
		filesToInclude: args.filesToInclude ?? '',
		filesToExclude: args.filesToExclude ?? '',
		isRegex: args.isRegex ?? false,
		isCaseSensitive: args.isRegex ?? false,
	};
	searchResponses.push({
		command: 'github.copilot.executeSearch',
		arguments: [searchArg],
		title: l10n.t("Search"),
	});
	return searchResponses;
}

export function parseSearchParams(modelResponseString: string): any {
	const codeBlock = extractCodeBlocks(modelResponseString).at(0);
	let args: any = undefined;
	if (codeBlock) {
		let parsed: any | undefined;
		try {
			parsed = parse(codeBlock.code);
		} catch (e) {
			// Ignore
		}

		if (parsed) {
			args = parsed;
		}
	}
	return args;
}

const findInFilesArgKeys: readonly (keyof FindInFilesArgs)[] = ['query', 'replace', 'filesToInclude', 'filesToExclude', 'isRegex', 'isCaseSensitive'];

/**
 * Renders text as a markdown inline code span. Backticks cannot be backslash-escaped inside a code
 * span, so the delimiter run is widened past the longest run in the text instead, which keeps the
 * whole text literal rather than letting it close the span early and render the rest as markdown.
 */
function toCodeSpan(text: string): string {
	const longestBacktickRun = Math.max(0, ...Array.from(text.matchAll(/`+/g), match => match[0].length));
	const fence = '`'.repeat(longestBacktickRun + 1);
	// A code span strips one space from each end when it has spaces on both ends and is not all spaces.
	const stripsSpaces = text.startsWith(' ') && text.endsWith(' ') && /[^ ]/.test(text);
	const padding = text.startsWith('`') || text.endsWith('`') || stripsSpaces ? ' ' : '';
	return `${fence}${padding}${text}${padding}${fence}`;
}

/**
 * Renders model-provided text as literal code inside a single markdown table cell.
 *
 * Line breaks would end the table row, so they are collapsed. A `|` would start a new cell, so it is
 * escaped as `\|`, which GFM honours even inside a code span. That escape only works when the pipe
 * follows an even number of backslashes though: after an odd run the added backslash makes the run
 * even, and the pipe splits the cell anyway. Those pipes cannot be represented inside a code span at
 * all, so the text is split around them and they are emitted between code spans as `&#124;`.
 */
function toTableCellCode(value: string): string {
	const text = value.replace(/\r\n|[\r\n\u2028\u2029]/g, ' ');
	return text
		.split(/(?<=(?<!\\)(?:\\\\)*\\)\|/)
		// CodeQL [SM02383] The remaining pipes follow an even backslash run, so escaping them keeps them in the cell.
		.map(segment => segment ? toCodeSpan(segment.replace(/\|/g, '\\|')) : '')
		.join('&#124;');
}

export function jsonToTable(args: any): string[] {
	if (!args) {
		return [];
	}
	const table = ['| Parameter  | Value |\n', '| ------ | ----- |\n'];
	// Only the known parameters are used by the search follow-up, and their fixed names need no escaping.
	for (const key of findInFilesArgKeys) {
		const value = args[key];
		if (value === undefined || value === '') {
			continue;
		}
		table.push(`| ${key} | ${toTableCellCode(String(value))} |\n`);
	}
	table.push(`\n`);
	return table;
}

export const searchIntentPromptSnippet = `Search for 'foo' in all files under my 'src' directory`;

class SearchIntentInvocation extends RendererIntentInvocation implements IIntentInvocation {

	constructor(
		intent: IIntent,
		location: ChatLocation,
		endpoint: IChatEndpoint,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(intent, location, endpoint);
	}

	createRenderer(promptContext: IBuildPromptContext, endpoint: IChatEndpoint, progress: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart>, token: vscode.CancellationToken) {
		return PromptRenderer.create(this.instantiationService, endpoint, SearchPrompt, {
			promptContext
		});
	}

	processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {
		const responseProcessor = this.instantiationService.createInstance(SearchResponseProcessor);
		return responseProcessor.processResponse(context, inputStream, outputStream, token);
	}
}

class SearchResponseProcessor extends PseudoStopStartResponseProcessor {

	private _response = '';

	constructor() {
		super(
			[{ start: '[ARGS END]', stop: '[ARGS START]' }],
			(delta) => jsonToTable(parseSearchParams(delta.join(''))),
		);
	}

	override async doProcessResponse(responseStream: AsyncIterable<IResponsePart>, progress: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {
		await super.doProcessResponse(responseStream, progress, token);
		const args = parseSearchParams(this._response ?? '');
		for (const command of createSearchFollowUps(args)) {
			progress.button(command);
		}
	}

	protected override applyDelta(delta: IResponseDelta, progress: vscode.ChatResponseStream): void {
		this._response += delta.text;
		super.applyDelta(delta, progress);
	}
}

export class SearchIntent implements IIntent {

	static readonly ID = Intent.Search;
	readonly id: string = Intent.Search;
	readonly locations = [ChatLocation.Panel];
	readonly description: string = l10n.t('Generate query parameters for workspace search');

	readonly commandInfo: IIntentSlashCommandInfo = {
		allowsEmptyArgs: false,
		defaultEnablement: isPreRelease,
	};

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
	) { }

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {
		const location = invocationContext.location;
		const endpoint = await this.endpointProvider.getChatEndpoint(invocationContext.request);
		return this.instantiationService.createInstance(SearchIntentInvocation, this, location, endpoint);
	}
}
