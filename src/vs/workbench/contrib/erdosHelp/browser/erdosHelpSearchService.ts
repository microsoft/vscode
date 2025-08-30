/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IErdosHelpService } from './erdosHelpService.js';
import { IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { RuntimeState, ILanguageRuntimeService } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export interface IHelpSearchResult {
	topic: string;
	languageId: string;
	languageName: string;
	isActive: boolean;
}

export interface IHelpRuntime {
	languageId: string;
	languageName: string;
	isActive: boolean;
	base64EncodedIconSvg?: string;
}

export const IErdosHelpSearchService = createDecorator<IErdosHelpSearchService>('erdosHelpSearchService');

export interface IErdosHelpSearchService {
	readonly _serviceBrand: undefined;
	
	/**
	 * Search help topics across all active language runtimes
	 */
	searchAllRuntimes(query: string): Promise<IHelpSearchResult[]>;
	
	/**
	 * Search help topics for a specific language runtime
	 */
	searchRuntime(languageId: string, query: string): Promise<string[]>;
	
	/**
	 * Get all active language runtimes that support help
	 */
	getActiveHelpRuntimes(): IHelpRuntime[];
}

export class ErdosHelpSearchService extends Disposable implements IErdosHelpSearchService {
	readonly _serviceBrand: undefined;
	
	constructor(
		@IErdosHelpService private readonly helpService: IErdosHelpService,
		@IRuntimeSessionService private readonly runtimeSessionService: IRuntimeSessionService,
		@ILanguageRuntimeService private readonly languageRuntimeService: ILanguageRuntimeService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}
	
	async searchAllRuntimes(query: string): Promise<IHelpSearchResult[]> {
		const allResults: IHelpSearchResult[] = [];
		const activeRuntimes = this.getActiveHelpRuntimes();
		
		// Search all active runtimes in parallel
		const searchPromises = activeRuntimes.map(async runtime => {
			try {
				const topics = await this.searchRuntime(runtime.languageId, query);
				
				const runtimeResults = topics.map(topic => ({
					topic,
					languageId: runtime.languageId,
					languageName: runtime.languageName,
					isActive: runtime.isActive
				}));
				
				return runtimeResults;
			} catch (error) {
				this.logService.warn(`Failed to search help topics for ${runtime.languageId}:`, error);
				return [];
			}
		});
		
		const results = await Promise.all(searchPromises);
		results.forEach(runtimeResults => {
			allResults.push(...runtimeResults);
		});
		
		// Check for duplicates before sorting
		const duplicateCheck = new Map<string, number>();
		allResults.forEach((result, index) => {
			const key = `${result.languageId}:${result.topic}`;
			if (duplicateCheck.has(key)) {
				this.logService.warn(`HelpSearchService.searchAllRuntimes: DUPLICATE FOUND at index ${index}: ${key} (previous at ${duplicateCheck.get(key)})`);
			} else {
				duplicateCheck.set(key, index);
			}
		});
		
		// Sort results: active runtimes first, then by relevance (topic length as proxy)
		const sortedResults = allResults.sort((a, b) => {
			if (a.isActive !== b.isActive) {
				return a.isActive ? -1 : 1;
			}
			// Secondary sort by topic length (shorter = more relevant)
			return a.topic.length - b.topic.length;
		});
		return sortedResults;
	}
	
	async searchRuntime(languageId: string, query: string): Promise<string[]> {
		try {
			const topics = await this.helpService.searchHelpTopics(languageId, query);
			const results = topics || [];
			return results;
		} catch (error) {
			this.logService.warn(`HelpSearchService.searchRuntime: Help search failed for ${languageId}:`, error);
			return [];
		}
	}
	
	getActiveHelpRuntimes(): { languageId: string; languageName: string; isActive: boolean; base64EncodedIconSvg?: string }[] {
		// Get all registered runtimes (available, but maybe not started)
		const registeredRuntimes = this.languageRuntimeService.registeredRuntimes;
		
		// Get all active runtime sessions
		const sessions = this.runtimeSessionService.activeSessions;
		
		// Create a map of active sessions by languageId
		const activeSessionsByLanguageId = new Map<string, boolean>();
		for (const session of sessions) {
			const isReady = session.getRuntimeState() === RuntimeState.Ready;
			const existingValue = activeSessionsByLanguageId.get(session.runtimeMetadata.languageId);
			if (existingValue !== undefined) {
				this.logService.warn(`HelpSearchService.getActiveHelpRuntimes: DUPLICATE languageId detected: ${session.runtimeMetadata.languageId} (previous=${existingValue}, new=${isReady})`);
			}
			activeSessionsByLanguageId.set(session.runtimeMetadata.languageId, isReady);
		}
		
		// Include all registered runtimes, marking which ones have active sessions
		// IMPORTANT: Deduplicate by languageId to prevent duplicate runtime entries
		const runtimesByLanguageId = new Map<string, { languageId: string; languageName: string; isActive: boolean; base64EncodedIconSvg?: string }>();
		
		for (const runtime of registeredRuntimes) {
			const isActive = activeSessionsByLanguageId.get(runtime.languageId) || false;
			
			// Only add if we haven't seen this languageId before, or if this one is more active
			const existing = runtimesByLanguageId.get(runtime.languageId);
			if (!existing || (isActive && !existing.isActive)) {
				runtimesByLanguageId.set(runtime.languageId, {
					languageId: runtime.languageId,
					languageName: runtime.languageName,
					isActive: isActive,
					base64EncodedIconSvg: runtime.base64EncodedIconSvg
				});
			}
		}
		
		// Convert map back to array
		const runtimes: { languageId: string; languageName: string; isActive: boolean; base64EncodedIconSvg?: string }[] = [];
		for (const runtime of runtimesByLanguageId.values()) {
			runtimes.push(runtime);
		}
		
		// Check for duplicate languageIds in final runtimes list
		const languageIdCounts = new Map<string, number>();
		runtimes.forEach(runtime => {
			const count = (languageIdCounts.get(runtime.languageId) || 0) + 1;
			languageIdCounts.set(runtime.languageId, count);
			if (count > 1) {
				this.logService.warn(`HelpSearchService.getActiveHelpRuntimes: DUPLICATE runtime in final list: ${runtime.languageId} (count=${count})`);
			}
		});
		
		// Sort by language name for consistent ordering
		const sortedRuntimes = runtimes.sort((a, b) => a.languageName.localeCompare(b.languageName));

		return sortedRuntimes;
	}
}
