/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { IWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { ITrustedDomainService } from '../../../url/browser/trustedDomainService.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolResult, IToolResultTextPart } from '../../common/languageModelToolsService.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { InternalFetchWebPageToolId } from '../../common/tools/tools.js';

export const FetchWebPageToolData: IToolData = {
	id: InternalFetchWebPageToolId,
	displayName: 'Fetch Web Page',
	canBeReferencedInPrompt: false,
	modelDescription: localize('fetchWebPage.modelDescription', 'Fetches the main content from a web page. This tool is useful for summarizing or analyzing the content of a webpage.'),
	source: { type: 'internal' },
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
	private _alreadyApprovedDomains = new Set<string>();

	constructor(
		@IWebContentExtractorService private readonly _readerModeService: IWebContentExtractorService,
		@ITrustedDomainService private readonly _trustedDomainService: ITrustedDomainService,
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _token: CancellationToken): Promise<IToolResult> {
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
			if (!this._trustedDomainService.isValid(uri)) {
				this._alreadyApprovedDomains.add(uri.toString(true));
			}
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

		return { content: this._getPromptPartsForResults(contentsWithUndefined) };
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
		const urlsNeedingConfirmation = valid.filter(url => !this._trustedDomainService.isValid(url) && !this._alreadyApprovedDomains.has(url.toString(true)));

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
			const confirmationTitle = urlsNeedingConfirmation.length > 1
				? localize('fetchWebPage.confirmationTitle.plural', 'Fetch untrusted web pages?')
				: localize('fetchWebPage.confirmationTitle.singular', 'Fetch untrusted web page?');

			const managedTrustedDomainsCommand = 'workbench.action.manageTrustedDomain';
			const confirmationMessage = new MarkdownString(
				urlsNeedingConfirmation.length > 1
					? urlsNeedingConfirmation.map(uri => `- ${uri.toString()}`).join('\n')
					: urlsNeedingConfirmation[0].toString(),
				{
					isTrusted: { enabledCommands: [managedTrustedDomainsCommand] },
					supportThemeIcons: true
				}
			);

			confirmationMessage.appendMarkdown(
				'\n\n$(info) ' + localize(
					'fetchWebPage.confirmationMessageManageTrustedDomains',
					'You can [manage your trusted domains]({0}) to skip this confirmation in the future.',
					`command:${managedTrustedDomainsCommand}`
				)
			);

			result.confirmationMessages = { title: confirmationTitle, message: confirmationMessage, allowAutoConfirm: false };
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
