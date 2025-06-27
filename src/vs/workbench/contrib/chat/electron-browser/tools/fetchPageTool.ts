/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, IToolResultTextPart, ToolDataSource, ToolProgress } from '../../common/languageModelToolsService.js';
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
		@IFileService private readonly _fileService: IFileService,
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const { webUris, fileUris, invalidUris } = this._parseUris((invocation.parameters as { urls?: string[] }).urls);
		const allValidUris = [...webUris.values(), ...fileUris.values()];
		
		if (!allValidUris.length && invalidUris.size === 0) {
			return {
				content: [{ kind: 'text', value: localize('fetchWebPage.noValidUrls', 'No valid URLs provided.') }]
			};
		}

		// We approved these via confirmation, so mark them as "approved" in this session
		// if they are not approved via the trusted domain service.
		for (const uri of webUris.values()) {
			this._alreadyApprovedDomains.add(uri);
		}

		// Get contents from web URIs
		const webContents = webUris.size > 0 ? await this._readerModeService.extract([...webUris.values()]) : [];
		
		// Get contents from file URIs
		const fileContents: (string | undefined)[] = [];
		for (const uri of fileUris.values()) {
			try {
				const fileContent = await this._fileService.readFile(uri, undefined, token);
				// Convert VSBuffer to string
				fileContents.push(fileContent.value.toString());
			} catch (error) {
				// If file service can't read it, treat as invalid
				fileContents.push(undefined);
			}
		}

		// Build results array in original order
		const urls = (invocation.parameters as { urls?: string[] }).urls || [];
		const results: (string | undefined)[] = [];
		let webIndex = 0;
		let fileIndex = 0;

		for (const url of urls) {
			if (invalidUris.has(url)) {
				results.push(undefined);
			} else if (webUris.has(url)) {
				results.push(webContents[webIndex]);
				webIndex++;
			} else if (fileUris.has(url)) {
				results.push(fileContents[fileIndex]);
				fileIndex++;
			} else {
				results.push(undefined);
			}
		}

		return {
			content: this._getPromptPartsForResults(results),
			// Have multiple results show in the dropdown
			toolResultDetails: allValidUris.length > 1 ? allValidUris : undefined
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const { webUris, fileUris, invalidUris } = this._parseUris(context.parameters.urls);
		const invalid = Array.from(invalidUris);
		const valid = [...webUris.values(), ...fileUris.values()];
		const urlsNeedingConfirmation = webUris.size > 0 ? [...webUris.values()].filter(url => !this._alreadyApprovedDomains.has(url)) : [];

		const pastTenseMessage = invalid.length
			? invalid.length > 1
				// If there are multiple invalid URLs, show them all
				? new MarkdownString(
					localize(
						'fetchWebPage.pastTenseMessage.plural',
						'Fetched {0} resources, but the following were invalid URLs:\n\n{1}\n\n', valid.length, invalid.map(url => `- ${url}`).join('\n')
					))
				// If there is only one invalid URL, show it
				: new MarkdownString(
					localize(
						'fetchWebPage.pastTenseMessage.singular',
						'Fetched resource, but the following was an invalid URL:\n\n{0}\n\n', invalid[0]
					))
			// No invalid URLs
			: new MarkdownString();

		const invocationMessage = new MarkdownString();
		if (valid.length > 1) {
			pastTenseMessage.appendMarkdown(localize('fetchWebPage.pastTenseMessageResult.plural', 'Fetched {0} resources', valid.length));
			invocationMessage.appendMarkdown(localize('fetchWebPage.invocationMessage.plural', 'Fetching {0} resources', valid.length));
		} else if (valid.length === 1) {
			const url = valid[0].toString();
			// If the URL is too long, show it as a link... otherwise, show it as plain text
			if (url.length > 400) {
				pastTenseMessage.appendMarkdown(localize({
					key: 'fetchWebPage.pastTenseMessageResult.singularAsLink',
					comment: [
						// Make sure the link syntax is correct
						'{Locked="]({0})"}',
					]
				}, 'Fetched [resource]({0})', url));
				invocationMessage.appendMarkdown(localize({
					key: 'fetchWebPage.invocationMessage.singularAsLink',
					comment: [
						// Make sure the link syntax is correct
						'{Locked="]({0})"}',
					]
				}, 'Fetching [resource]({0})', url));
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

	private _parseUris(urls?: string[]): { webUris: Map<string, URI>; fileUris: Map<string, URI>; invalidUris: Set<string> } {
		const webUris = new Map<string, URI>();
		const fileUris = new Map<string, URI>();
		const invalidUris = new Set<string>();

		urls?.forEach(url => {
			try {
				const uriObj = URI.parse(url);
				if (uriObj.scheme === 'http' || uriObj.scheme === 'https') {
					webUris.set(url, uriObj);
				} else {
					// Try to handle other schemes via file service
					fileUris.set(url, uriObj);
				}
			} catch (e) {
				invalidUris.add(url);
			}
		});

		return { webUris, fileUris, invalidUris };
	}

	private _getPromptPartsForResults(results: (string | undefined)[]): IToolResultTextPart[] {
		return results.map(value => ({
			kind: 'text',
			value: value || localize('fetchWebPage.invalidUrl', 'Invalid URL')
		}));
	}
}
