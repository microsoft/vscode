/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, type PromptSizing } from '@vscode/prompt-tsx';
import type { CancellationToken, ChatResponsePart, Position, Progress } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ContextKind, ILanguageContextService, KnownSources, SnippetContext, type RequestContext } from '../../../../platform/languageServer/common/languageContextService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { Iterable } from '../../../../util/vs/base/common/iterator';
import { TelemetryData } from '../../../prompt/node/intents';
import { Tag } from '../base/tag';
import { CodeBlock, Uri as UriElement, UriMode } from '../panel/safeElements';


export type LanguageServerContextProps = PromptElementProps<{
	/**
	 * The text document to get context for.
	 */
	document: TextDocumentSnapshot;

	/**
	 * The position in the document to get context for.
	 */
	position: Position;

	/**
	 * The request id for the context.
	 */
	requestId?: string;

	/**
	 * The source of the request.
	 */
	source?: KnownSources | string;
}>;


export class LanguageServerContextStats extends TelemetryData {
	constructor(
		readonly snippetCounts: number,
		readonly totalCharLength: number,
	) {
		super();
	}
}

export class LanguageServerContextPrompt extends PromptElement<LanguageServerContextProps> {

	private static CompletionContext: RequestContext = {
		requestId: '0013686c-f799-4ed9-ad07-35369dbd6e26',
		timeBudget: 2500,
		tokenBudget: 32_000,
	};

	constructor(
		props: LanguageServerContextProps,
		@ILanguageContextService private readonly languageContextService: ILanguageContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IIgnoreService private readonly ignoreService: IIgnoreService

	) {
		super(props);
	}

	async render(_state: void, sizing: PromptSizing, _progress: Progress<ChatResponsePart>, token: CancellationToken) {

		const configKey = this.props.source === KnownSources.chat
			? ConfigKey.TypeScriptLanguageContextInline
			: this.props.source === KnownSources.fix
				? ConfigKey.TypeScriptLanguageContextFix
				: undefined;

		if (configKey === undefined) {
			return;
		}
		const useLanguageServerContext = this.configurationService.getExperimentBasedConfig(configKey, this.experimentationService);
		if (!useLanguageServerContext) {
			return;
		}

		if (!await this.languageContextService.isActivated(this.props.document.languageId)) {
			return;
		}

		const context: RequestContext = Object.assign({}, LanguageServerContextPrompt.CompletionContext, { tokenBudget: sizing.tokenBudget });
		if (this.props.requestId !== undefined) {
			context.requestId = this.props.requestId;
		}
		if (this.props.source !== undefined) {
			context.source = this.props.source;
		}

		const validItems: SnippetContext[] = [];
		const contextItems = this.languageContextService.getContext(this.props.document.document, this.props.position, context, token);
		outer: for await (const item of contextItems) {
			if (item.kind === ContextKind.Snippet) {
				if (item.value.length === 0) {
					continue;
				}
				if (await this.ignoreService.isCopilotIgnored(item.uri)) {
					continue;
				}
				if (item.additionalUris !== undefined && item.additionalUris.length > 0) {
					for (const uri of item.additionalUris) {
						if (await this.ignoreService.isCopilotIgnored(uri)) {
							continue outer;
						}
					}
				}
				validItems.push(item);
			}
		}
		if (validItems.length === 0) {
			return;
		}

		return <Tag name='languageServerContext'>
			A language server finds these documents helpful for answering the user's question<br />
			<Tag name='note'>
				These documents are provided as extra insights but are not meant to be edited or changed in any way.
			</Tag>
			{
				validItems.map(item => {
					return <>
						<Tag name='documentFragment'>
							From `<UriElement value={item.uri} mode={UriMode.Path} />` I have read or edited:<br />
							<CodeBlock uri={item.uri} code={item.value} priority={item.priority * Number.MAX_SAFE_INTEGER} />
						</Tag>
						<br />
					</>;
				})
			}
			<meta value={new LanguageServerContextStats(
				validItems.length,
				Iterable.reduce(validItems.values(), (t, item) => t + item.value.length, 0))
			} />
		</Tag>;
	}
}
