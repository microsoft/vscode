/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolResult, IToolResultTextPart, ToolDataSource, ToolProgress } from '../../common/languageModelToolsService.js';
import { InternalFetchWebPageToolId } from '../../common/tools/tools.js';

export const FetchWebPageToolData: IToolData = {
	id: InternalFetchWebPageToolId,
	displayName: 'Fetch Web Page',
	canBeReferencedInPrompt: false,
	modelDescription: localize('fetchWebPage.modelDescription', 'Fetches the main content from a web page. This tool is useful for summarizing or analyzing the content of a webpage.'),
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			urls: {
				type: 'array',
				items: {
					type: 'string',
				},
				description: localize('fetchWebPage.urlsDescription', 'An array of URLs to fetch content from.')
			}
		},
		required: ['urls']
	}
};

export class FetchWebPageTool implements IToolImpl {
	private _alreadyApprovedDomains = new ResourceSet();

	constructor(
		@IWebContentExtractorService private readonly _readerModeService: IWebContentExtractorService,
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const parsedUriResults = this._parseUris((invocation.parameters as { urls?: string[] }).urls);
		const validUris = Array.from(parsedUriResults.values()).filter((uri): uri is URI => !!uri);
		if (!validUris.length) {
			return {
				content: [{ kind: 'text', value: localize('fetchWebPage.noValidUrls', 'No valid URLs provided.') }]
			};
		}

		// We approved these via confirmation, so mark them as "approved" in this session
		// if they are not approved via the trusted domain service.
		for (const uri of validUris) {
			this._alreadyApprovedDomains.add(uri);
		}

		const contents = await this._readerModeService.extract(validUris);
		// Make an array that contains either the content or undefined for invalid URLs
		const contentsWithUndefined: (string | undefined)[] = [];
		let indexInContents = 0;
		parsedUriResults.forEach((uri) => {
			if (uri) {
				contentsWithUndefined.push(contents[indexInContents]);
				indexInContents++;
			} else {
				contentsWithUndefined.push(undefined);
			}
		});

		return {
			content: this._getPromptPartsForResults(contentsWithUndefined),
			// Have multiple results show in the dropdown
			toolResultDetails: validUris.length > 1 ? validUris : undefined
		};
	}

	async prepareToolInvocation(parameters: any, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const map = this._parseUris(parameters.urls);
		const invalid = new Array<string>();
		const valid = new Array<URI>();
		map.forEach((uri, url) => {
			if (!uri) {
				invalid.push(url);
			} else {
				valid.push(uri);
			}
		});
		const urlsNeedingConfirmation = valid.filter(url => !this._alreadyApprovedDomains.has(url));

		const pastTenseMessage = invalid.length
			? invalid.length > 1
				// If there are multiple invalid URLs, show them all
				? new MarkdownString(
					localize(
						'fetchWebPage.pastTenseMessage.plural',
						'Fetched {0} web pages, but the following were invalid URLs:\n\n{1}\n\n', valid.length, invalid.map(url => `- ${url}`).join('\n')
					))
				// If there is only one invalid URL, show it
				: new MarkdownString(
					localize(
						'fetchWebPage.pastTenseMessage.singular',
						'Fetched web page, but the following was an invalid URL:\n\n{0}\n\n', invalid[0]
					))
			// No invalid URLs
			: new MarkdownString();

		const invocationMessage = new MarkdownString();
		if (valid.length > 1) {
			pastTenseMessage.appendMarkdown(localize('fetchWebPage.pastTenseMessageResult.plural', 'Fetched {0} web pages', valid.length));
			invocationMessage.appendMarkdown(localize('fetchWebPage.invocationMessage.plural', 'Fetching {0} web pages', valid.length));
		} else {
			const url = valid[0].toString();
			// If the URL is too long, show it as a link... otherwise, show it as plain text
			if (url.length > 400) {
				pastTenseMessage.appendMarkdown(localize({
					key: 'fetchWebPage.pastTenseMessageResult.singularAsLink',
					comment: [
						// Make sure the link syntax is correct
						'{Locked="]({0})"}',
					]
				}, 'Fetched [web page]({0})', url));
				invocationMessage.appendMarkdown(localize({
					key: 'fetchWebPage.invocationMessage.singularAsLink',
					comment: [
						// Make sure the link syntax is correct
						'{Locked="]({0})"}',
					]
				}, 'Fetching [web page]({0})', url));
			} else {
				pastTenseMessage.appendMarkdown(localize('fetchWebPage.pastTenseMessageResult.singular', 'Fetched {0}', url));
				invocationMessage.appendMarkdown(localize('fetchWebPage.invocationMessage.singular', 'Fetching {0}', url));
			}
		}

		const result: IPreparedToolInvocation = { invocationMessage, pastTenseMessage };
		if (urlsNeedingConfirmation.length) {
			let confirmationTitle: string;
			let confirmationMessage: string | MarkdownString;
			if (urlsNeedingConfirmation.length === 1) {
				confirmationTitle = localize('fetchWebPage.confirmationTitle.singular', 'Fetch web page?');
				confirmationMessage = new MarkdownString(
					urlsNeedingConfirmation[0].toString() + '\n\n$(info) ' +
					localize('fetchWebPage.confirmationMessage.singular', 'Web content may contain malicious code or attempt prompt injection attacks.'),
					{ supportThemeIcons: true }
				);
			} else {
				confirmationTitle = localize('fetchWebPage.confirmationTitle.plural', 'Fetch web pages?');
				confirmationMessage = new MarkdownString(
					urlsNeedingConfirmation.map(uri => `- ${uri.toString()}`).join('\n') + '\n\n$(info) ' +
					localize('fetchWebPage.confirmationMessage.plural', 'Web content may contain malicious code or attempt prompt injection attacks.'),
					{ supportThemeIcons: true }
				);
			}
			result.confirmationMessages = { title: confirmationTitle, message: confirmationMessage, allowAutoConfirm: true };
		}
		return result;
	}

	private _parseUris(urls?: string[]): Map<string, URI | undefined> {
		const results = new Map<string, URI | undefined>();
		urls?.forEach(uri => {
			try {
				const uriObj = URI.parse(uri);
				results.set(uri, uriObj);
			} catch (e) {
				results.set(uri, undefined);
			}
		});
		return results;
	}

	private _getPromptPartsForResults(results: (string | undefined)[]): IToolResultTextPart[] {
		return results.map(value => ({
			kind: 'text',
			value: value || localize('fetchWebPage.invalidUrl', 'Invalid URL')
		}));
	}
}
