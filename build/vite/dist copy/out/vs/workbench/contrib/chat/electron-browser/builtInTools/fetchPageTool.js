/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { assertNever } from '../../../../../base/common/assert.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { extname } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { detectEncodingFromBuffer } from '../../../../services/textfile/common/encoding.js';
import { ITrustedDomainService } from '../../../url/browser/trustedDomainService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatImageMimeType } from '../../common/languageModels.js';
import { ToolDataSource } from '../../common/tools/languageModelToolsService.js';
import { InternalFetchWebPageToolId } from '../../common/tools/builtinTools/tools.js';
export const FetchWebPageToolData = {
    id: InternalFetchWebPageToolId,
    displayName: 'Fetch Web Page',
    canBeReferencedInPrompt: false,
    modelDescription: 'Fetches the main content from a web page. This tool is useful for summarizing or analyzing the content of a webpage.',
    source: ToolDataSource.Internal,
    canRequestPostApproval: true,
    canRequestPreApproval: true,
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
let FetchWebPageTool = class FetchWebPageTool {
    constructor(_readerModeService, _fileService, _trustedDomainService, _chatService, _workspaceContextService) {
        this._readerModeService = _readerModeService;
        this._fileService = _fileService;
        this._trustedDomainService = _trustedDomainService;
        this._chatService = _chatService;
        this._workspaceContextService = _workspaceContextService;
    }
    async invoke(invocation, _countTokens, _progress, token) {
        const urls = invocation.parameters.urls || [];
        const { webUris, fileUris, invalidUris } = this._parseUris(urls);
        const allValidUris = [...webUris.values(), ...fileUris.values()];
        if (!allValidUris.length && invalidUris.size === 0) {
            return {
                content: [{ kind: 'text', value: localize('fetchWebPage.noValidUrls', 'No valid URLs provided.') }]
            };
        }
        // Get contents from web URIs
        let webContents = [];
        if (webUris.size > 0) {
            const trustedDomains = this._trustedDomainService.trustedDomains;
            webContents = await this._readerModeService.extract([...webUris.values()], { trustedDomains });
        }
        // Get contents from file URIs
        const fileContents = [];
        const successfulFileUris = [];
        for (const uri of fileUris.values()) {
            try {
                const fileContent = await this._fileService.readFile(uri, undefined, token);
                // Check if this is a supported image type first
                const imageMimeType = this._getSupportedImageMimeType(uri);
                if (imageMimeType) {
                    // For supported image files, return as IToolResultDataPart
                    fileContents.push({
                        type: 'tooldata',
                        value: {
                            kind: 'data',
                            value: {
                                mimeType: imageMimeType,
                                data: fileContent.value
                            }
                        }
                    });
                }
                else {
                    // Check if the content is binary
                    const detected = detectEncodingFromBuffer({ buffer: fileContent.value, bytesRead: fileContent.value.byteLength });
                    if (detected.seemsBinary) {
                        // For binary files, return a message indicating they're not supported
                        // We do this for now until the tools that leverage this internal tool can support binary content
                        fileContents.push(localize('fetchWebPage.binaryNotSupported', 'Binary files are not supported at the moment.'));
                    }
                    else {
                        // For text files, convert to string
                        fileContents.push(fileContent.value.toString());
                    }
                }
                successfulFileUris.push(uri);
            }
            catch (error) {
                // If file service can't read it, treat as invalid
                fileContents.push(undefined);
            }
        }
        // Build results array in original order
        const results = [];
        let webIndex = 0;
        let fileIndex = 0;
        for (const url of urls) {
            if (invalidUris.has(url)) {
                results.push(undefined);
            }
            else if (webUris.has(url)) {
                results.push({ type: 'extracted', value: webContents[webIndex] });
                webIndex++;
            }
            else if (fileUris.has(url)) {
                results.push(fileContents[fileIndex]);
                fileIndex++;
            }
            else {
                results.push(undefined);
            }
        }
        // Skip confirming any results if every web content we got was an error or redirect
        let confirmResults;
        if (webContents.every(e => e.status === 'error' || e.status === 'redirect')) {
            confirmResults = false;
        }
        // Only include URIs that actually had content successfully fetched
        const actuallyValidUris = [...webUris.values(), ...successfulFileUris];
        return {
            content: this._getPromptPartsForResults(urls, results),
            toolResultDetails: actuallyValidUris,
            confirmResults,
        };
    }
    async prepareToolInvocation(context, token) {
        const { webUris, fileUris, invalidUris } = this._parseUris(context.parameters.urls);
        // Check which file URIs can actually be read
        const validFileUris = [];
        const additionalInvalidUrls = [];
        for (const [originalUrl, uri] of fileUris.entries()) {
            try {
                await this._fileService.stat(uri);
                validFileUris.push(uri);
            }
            catch (error) {
                // If file service can't stat it, treat as invalid
                additionalInvalidUrls.push(originalUrl);
            }
        }
        const invalid = [...Array.from(invalidUris), ...additionalInvalidUrls];
        // All valid URIs (web + file) for display in messages
        const allFetchedUris = new ResourceSet([...webUris.values(), ...validFileUris]);
        // File URIs that are inside the workspace don't need confirmation — they're already accessible
        // and don't carry the web content risks (prompt injection, malicious redirects).
        // File URIs outside the workspace are treated like web URIs and require confirmation.
        const fileUrisOutsideWorkspace = validFileUris.filter(uri => !this._workspaceContextService.getWorkspaceFolder(uri));
        const urlsNeedingConfirmation = new ResourceSet([...webUris.values(), ...fileUrisOutsideWorkspace]);
        const pastTenseMessage = invalid.length
            ? invalid.length > 1
                // If there are multiple invalid URLs, show them all
                ? new MarkdownString(localize('fetchWebPage.pastTenseMessage.plural', 'Fetched {0} resources, but the following were invalid URLs:\n\n{1}\n\n', allFetchedUris.size, invalid.map(url => `- ${url}`).join('\n')))
                // If there is only one invalid URL, show it
                : new MarkdownString(localize('fetchWebPage.pastTenseMessage.singular', 'Fetched resource, but the following was an invalid URL:\n\n{0}\n\n', invalid[0]))
            // No invalid URLs
            : new MarkdownString();
        const invocationMessage = new MarkdownString();
        if (allFetchedUris.size > 1) {
            pastTenseMessage.appendMarkdown(localize('fetchWebPage.pastTenseMessageResult.plural', 'Fetched {0} resources', allFetchedUris.size));
            invocationMessage.appendMarkdown(localize('fetchWebPage.invocationMessage.plural', 'Fetching {0} resources', allFetchedUris.size));
        }
        else if (allFetchedUris.size === 1) {
            const url = Iterable.first(allFetchedUris).toString(true);
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
            }
            else {
                pastTenseMessage.appendMarkdown(localize('fetchWebPage.pastTenseMessageResult.singular', 'Fetched {0}', url));
                invocationMessage.appendMarkdown(localize('fetchWebPage.invocationMessage.singular', 'Fetching {0}', url));
            }
        }
        let confirmationNotNeededReason;
        if (context.chatSessionResource) {
            const model = this._chatService.getSession(context.chatSessionResource);
            const userMessages = model?.getRequests().map(r => r.message.text.toLowerCase());
            let urlsMentionedInPrompt = false;
            for (const uri of urlsNeedingConfirmation) {
                // Normalize to lowercase and remove any trailing slash
                const toToCheck = uri.toString(true).toLowerCase().replace(/\/$/, '');
                if (userMessages?.some(m => m.includes(toToCheck))) {
                    urlsNeedingConfirmation.delete(uri);
                    urlsMentionedInPrompt = true;
                }
            }
            if (urlsMentionedInPrompt && urlsNeedingConfirmation.size === 0) {
                confirmationNotNeededReason = localize('fetchWebPage.urlMentionedInPrompt', 'Auto approved because URL was in prompt');
            }
        }
        const result = { invocationMessage, pastTenseMessage };
        const allDomainsTrusted = Iterable.every(urlsNeedingConfirmation, u => this._trustedDomainService.isValid(u));
        let confirmationTitle;
        let confirmationMessage;
        if (urlsNeedingConfirmation.size && !allDomainsTrusted) {
            if (urlsNeedingConfirmation.size === 1) {
                confirmationTitle = localize('fetchWebPage.confirmationTitle.singular', 'Fetch web page?');
                confirmationMessage = new MarkdownString(Iterable.first(urlsNeedingConfirmation).toString(true), { supportThemeIcons: true });
            }
            else {
                confirmationTitle = localize('fetchWebPage.confirmationTitle.plural', 'Fetch web pages?');
                confirmationMessage = new MarkdownString([...urlsNeedingConfirmation].map(uri => `- ${uri.toString(true)}`).join('\n'), { supportThemeIcons: true });
            }
        }
        result.confirmationMessages = {
            title: confirmationTitle,
            message: confirmationMessage,
            confirmResults: urlsNeedingConfirmation.size > 0,
            allowAutoConfirm: true,
            disclaimer: new MarkdownString('$(info) ' + localize('fetchWebPage.confirmationMessage.plural', 'Web content may contain malicious code or attempt prompt injection attacks.'), { supportThemeIcons: true }),
            confirmationNotNeededReason
        };
        return result;
    }
    _parseUris(urls) {
        const webUris = new Map();
        const fileUris = new Map();
        const invalidUris = new Set();
        urls?.forEach(url => {
            try {
                const uriObj = URI.parse(url);
                if (uriObj.scheme === 'http' || uriObj.scheme === 'https') {
                    webUris.set(url, uriObj);
                }
                else {
                    // Try to handle other schemes via file service
                    fileUris.set(url, uriObj);
                }
            }
            catch (e) {
                invalidUris.add(url);
            }
        });
        return { webUris, fileUris, invalidUris };
    }
    _getPromptPartsForResults(urls, results) {
        return results.map((value, i) => {
            const title = results.length > 1 ? localize('fetchWebPage.fetchedFrom', 'Fetched from {0}', urls[i]) : undefined;
            if (!value) {
                return {
                    kind: 'text',
                    title,
                    value: localize('fetchWebPage.invalidUrl', 'Invalid URL')
                };
            }
            else if (typeof value === 'string') {
                return {
                    kind: 'text',
                    title,
                    value: value
                };
            }
            else if (value.type === 'tooldata') {
                return { ...value.value, title };
            }
            else if (value.type === 'extracted') {
                switch (value.value.status) {
                    case 'ok':
                        return { kind: 'text', title, value: value.value.result };
                    case 'redirect':
                        return { kind: 'text', title, value: `The webpage has redirected to "${value.value.toURI.toString(true)}". Use the ${InternalFetchWebPageToolId} again to get its contents.` };
                    case 'error':
                        return { kind: 'text', title, value: `An error occurred retrieving the fetch result: ${value.value.error}` };
                    default:
                        assertNever(value.value);
                }
            }
            else {
                throw new Error('unreachable');
            }
        });
    }
    _getSupportedImageMimeType(uri) {
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
};
FetchWebPageTool = __decorate([
    __param(0, IWebContentExtractorService),
    __param(1, IFileService),
    __param(2, ITrustedDomainService),
    __param(3, IChatService),
    __param(4, IWorkspaceContextService)
], FetchWebPageTool);
export { FetchWebPageTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmV0Y2hQYWdlVG9vbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvZWxlY3Ryb24tYnJvd3Nlci9idWlsdEluVG9vbHMvZmV0Y2hQYWdlVG9vbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbkUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSwyQkFBMkIsRUFBMkIsTUFBTSwyRUFBMkUsQ0FBQztBQUNqSixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNyRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbkUsT0FBTyxFQUFpTCxjQUFjLEVBQWdCLE1BQU0saURBQWlELENBQUM7QUFDOVEsT0FBTyxFQUFF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