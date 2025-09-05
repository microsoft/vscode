/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { extname } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { detectEncodingFromBuffer } from '../../../../services/textfile/common/encoding.js';
import { ChatImageMimeType } from '../../common/languageModels.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, IToolResultDataPart, IToolResultTextPart, ToolDataSource, ToolProgress } from '../../common/languageModelToolsService.js';
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
		const urls = (invocation.parameters as { urls?: string[] }).urls || [];
		const { webUris, fileUris, invalidUris } = this._parseUris(urls);
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
		const fileContents: (string | IToolResultDataPart | undefined)[] = [];
		const successfulFileUris: URI[] = [];
		for (const uri of fileUris.values()) {
			try {
				const fileContent = await this._fileService.readFile(uri, undefined, token);

				// Check if this is a supported image type first
				const imageMimeType = this._getSupportedImageMimeType(uri);
				if (imageMimeType) {
					// For supported image files, return as IToolResultDataPart
					fileContents.push({
						kind: 'data',
						value: {
							mimeType: imageMimeType,
							data: fileContent.value
						}
					});
				} else {
					// Check if the content is binary
					const detected = detectEncodingFromBuffer({ buffer: fileContent.value, bytesRead: fileContent.value.byteLength });

					if (detected.seemsBinary) {
						// For binary files, return a message indicating they're not supported
						// We do this for now until the tools that leverage this internal tool can support binary content
						fileContents.push(localize('fetchWebPage.binaryNotSupported', 'Binary files are not supported at the moment.'));
					} else {
						// For text files, convert to string
						fileContents.push(fileContent.value.toString());
					}
				}

				successfulFileUris.push(uri);
			} catch (error) {
				// If file service can't read it, treat as invalid
				fileContents.push(undefined);
			}
		}

		// Build results array in original order
		const results: (string | IToolResultDataPart | undefined)[] = [];
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

		// Only include URIs that actually had content successfully fetched
		const actuallyValidUris = [...webUris.values(), ...successfulFileUris];

		return {
			content: this._getPromptPartsForResults(results),
			toolResultDetails: actuallyValidUris
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const { webUris, fileUris, invalidUris } = this._parseUris(context.parameters.urls);

		// Check which file URIs can actually be read
		const validFileUris: URI[] = [];
		const additionalInvalidUrls: string[] = [];
		for (const [originalUrl, uri] of fileUris.entries()) {
			try {
				await this._fileService.stat(uri);
				validFileUris.push(uri);
			} catch (error) {
				// If file service can't stat it, treat as invalid
				additionalInvalidUrls.push(originalUrl);
			}
		}

		const invalid = [...Array.from(invalidUris), ...additionalInvalidUrls];
		const valid = [...webUris.values(), ...validFileUris];
		const urlsNeedingConfirmation = valid.length > 0 ? valid.filter(url => !this._alreadyApprovedDomains.has(url)) : [];

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
			// If the URL is too long or it's a file url, show it as a link... otherwise, show it as plain text
			if (url.length > 400 || validFileUris.length === 1) {
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
					urlsNeedingConfirmation[0].toString(),
					{ supportThemeIcons: true }
				);
			} else {
				confirmationTitle = localize('fetchWebPage.confirmationTitle.plural', 'Fetch web pages?');
				confirmationMessage = new MarkdownString(
					urlsNeedingConfirmation.map(uri => `- ${uri.toString()}`).join('\n'),
					{ supportThemeIcons: true }
				);
			}
			result.confirmationMessages = {
				title: confirmationTitle,
				message: confirmationMessage,
				allowAutoConfirm: true,
				disclaimer: new MarkdownString('$(info) ' + localize('fetchWebPage.confirmationMessage.plural', 'Web content may contain malicious code or attempt prompt injection attacks.'), { supportThemeIcons: true })
			};
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

	private _getPromptPartsForResults(results: (string | IToolResultDataPart | undefined)[]): (IToolResultTextPart | IToolResultDataPart)[] {
		return results.map(value => {
			if (!value) {
				return {
					kind: 'text',
					value: localize('fetchWebPage.invalidUrl', 'Invalid URL')
				};
			} else if (typeof value === 'string') {
				return {
					kind: 'text',
					value: value
				};
			} else {
				// This is an IToolResultDataPart
				return value;
			}
		});
	}

	private _getSupportedImageMimeType(uri: URI): ChatImageMimeType | undefined {
		const ext = extname(uri.path).toLowerCase();
		switch (ext) {
			case '.png':
				return ChatImageMimeType.PNG;
			case '.jpg':
			case '.jpeg':
				return ChatImageMimeType.JPEG;
			case '.gif':
				return ChatImageMimeType.GIF;
			case '.webp':
				return ChatImageMimeType.WEBP;
			case '.bmp':
				return ChatImageMimeType.BMP;
			default:
				return undefined;
		}
	}
}
