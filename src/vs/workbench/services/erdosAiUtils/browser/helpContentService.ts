/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IHelpContentService } from '../common/helpContentService.js';
import { IErdosHelpService } from '../../../contrib/erdosHelp/browser/erdosHelpService.js';
import { IErdosHelpSearchService } from '../../../contrib/erdosHelp/browser/erdosHelpSearchService.js';
import { IWebContentExtractorService } from '../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { URI } from '../../../../base/common/uri.js';

export class HelpContentService extends Disposable implements IHelpContentService {
	readonly _serviceBrand: undefined;

	constructor(
		@IErdosHelpService private readonly helpService: IErdosHelpService,
		@IErdosHelpSearchService private readonly helpSearchService: IErdosHelpSearchService,
		@IWebContentExtractorService private readonly webContentExtractorService: IWebContentExtractorService
	) {
		super();
	}

	/**
	 * Get help as markdown using the same system as the help pane
	 * This integrates with the help search service and help service for consistency
	 */
	async getHelpAsMarkdown(topic: string, packageName?: string, language?: 'R' | 'Python'): Promise<string> {

		try {
			// Find the best matching topic using the same search as help pane
			let searchResults: Array<{topic: string, languageId: string}> = [];
			
			if (language) {
				const langId = language.toLowerCase() === 'python' ? 'python' : 'r';
				const topics = await this.helpSearchService.searchRuntime(langId, topic);
				searchResults = topics.map(t => ({ topic: t, languageId: langId }));
			} else {
				const allResults = await this.helpSearchService.searchAllRuntimes(topic);
				searchResults = allResults.map(r => ({ topic: r.topic, languageId: r.languageId }));
			}

			if (searchResults.length === 0) {
				return `Help topic: ${topic}\n\nNo help topics found.`;
			}

			// Find exact match - do NOT fall back to first result if no exact match
			const bestMatch = searchResults.find(r => r.topic === topic);
			if (!bestMatch) {
				return `Help topic: ${topic}\n\nNo help topics found.`;
			}

			// Get the help clients and find the right one
			const helpClients = this.helpService.getHelpClients();
			const helpClient = helpClients.find(c => c.languageId === bestMatch.languageId);
			
			if (!helpClient) {
				return `Help topic: ${bestMatch.topic}\n\nNo ${bestMatch.languageId} runtime available.`;
			}

			// Create promise to capture the content that would be shown in help pane
			return new Promise<string>((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error('Help request timed out'));
				}, 5000);
				
				// Listen for the same content the help pane gets
				const disposable = helpClient.onDidEmitHelpContent(async (event: any) => {
					clearTimeout(timeout);
					disposable.dispose();
					
					
					// Handle different content types based on the kind field
					try {
						switch (event.kind) {
							case 'url':
								const uri = URI.parse(event.content);
								const extractedContent = await this.webContentExtractorService.extractRawHtml([uri]);
								
								if (extractedContent.length === 0 || !extractedContent[0]) {
									resolve(`Help topic: ${bestMatch.topic}\n\nNo content could be extracted from help server`);
									return;
								}
								
								const markdownContent = extractedContent[0];
								if (!markdownContent || markdownContent.trim().length === 0) {
									resolve(`Help topic: ${bestMatch.topic}\n\nEmpty help content received from server`);
									return;
								}
								
								resolve(markdownContent);
								break;
								
							case 'markdown':
								resolve(event.content);
								break;
								
							case 'html':
								// TODO: Convert HTML to markdown if needed
								// For now, return HTML as-is
								resolve(event.content);
								break;
								
							default:
								resolve(`Help topic: ${bestMatch.topic}\n\nUnsupported help content format: ${event.kind}`);
								break;
						}
					} catch (error) {
						resolve(`Help topic: ${bestMatch.topic}\n\nFailed to process help content. Error: ${error}`);
					}
				});
				
				// Trigger the same call the help pane makes
				helpClient.showHelpTopic(bestMatch.topic).catch((error: any) => {
					clearTimeout(timeout);
					disposable.dispose();
					reject(error);
				});
			});

		} catch (error) {
			console.error('HELP SERVICE: Error:', error);
			return `Help topic: ${topic}\n\nError retrieving help content.`;
		}
	}

}
