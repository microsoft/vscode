/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IErdosHelpService } from './services/helpService.js';
import { IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { RuntimeState, ILanguageRuntimeService } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export interface IDocumentationMatch {
	topic: string;
	languageId: string;
	languageName: string;
	isActive: boolean;
}

export interface ILanguageEnvironment {
	languageId: string;
	languageName: string;
	isActive: boolean;
	base64EncodedIconSvg?: string;
}

export const ITopicQueryService = createDecorator<ITopicQueryService>('topicQueryService');

export interface ITopicQueryService {
	readonly _serviceBrand: undefined;
	
	queryAllLanguages(query: string): Promise<IDocumentationMatch[]>;
	queryLanguage(languageId: string, query: string): Promise<string[]>;
	getAvailableLanguageRuntimes(): ILanguageEnvironment[];
}

export class TopicQueryService extends Disposable implements ITopicQueryService {
	readonly _serviceBrand: undefined;
	
	constructor(
		@IErdosHelpService private readonly helpService: IErdosHelpService,
		@IRuntimeSessionService private readonly runtimeSessionService: IRuntimeSessionService,
		@ILanguageRuntimeService private readonly languageRuntimeService: ILanguageRuntimeService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}
	
	async queryAllLanguages(query: string): Promise<IDocumentationMatch[]> {
		const aggregatedMatches: IDocumentationMatch[] = [];
		const availableEnvironments = this.getAvailableLanguageRuntimes();
		
		const queryTasks = availableEnvironments.map(async environment => {
			try {
				const discoveredTopics = await this.queryLanguage(environment.languageId, query);
				
				const environmentMatches = discoveredTopics.map(topic => ({
					topic,
					languageId: environment.languageId,
					languageName: environment.languageName,
					isActive: environment.isActive
				}));
				
				return environmentMatches;
			} catch (error) {
				this.logService.warn(`TopicQueryService: Failed to query ${environment.languageId}:`, error);
				return [];
			}
		});
		
		const batchResults = await Promise.all(queryTasks);
		batchResults.forEach(envMatches => {
			aggregatedMatches.push(...envMatches);
		});
		
		
		const prioritized = aggregatedMatches.sort((a, b) => {
			if (a.isActive !== b.isActive) {
				return a.isActive ? -1 : 1;
			}
			return a.topic.length - b.topic.length;
		});
		return prioritized;
	}
	
	async queryLanguage(languageId: string, query: string): Promise<string[]> {
		try {
			const discoveredTopics = await this.helpService.searchHelpTopics(languageId, query);
			return discoveredTopics || [];
		} catch (error) {
			this.logService.warn(`TopicQueryService: Language query failed for ${languageId}:`, error);
			return [];
		}
	}
	
	getAvailableLanguageRuntimes(): ILanguageEnvironment[] {
		const catalogedRuntimes = this.languageRuntimeService.registeredRuntimes;
		const activeSessions = this.runtimeSessionService.activeSessions;
		
		const sessionActivityMap = new Map<string, boolean>();
		for (const session of activeSessions) {
			const operationalStatus = session.getRuntimeState() === RuntimeState.Ready;
			sessionActivityMap.set(session.runtimeMetadata.languageId, operationalStatus);
		}
		
		const environmentRegistry = new Map<string, ILanguageEnvironment>();
		
		for (const runtime of catalogedRuntimes) {
			const operational = sessionActivityMap.get(runtime.languageId) || false;
			
			const current = environmentRegistry.get(runtime.languageId);
			if (!current || (operational && !current.isActive)) {
				environmentRegistry.set(runtime.languageId, {
					languageId: runtime.languageId,
					languageName: runtime.languageName,
					isActive: operational,
					base64EncodedIconSvg: runtime.base64EncodedIconSvg
				});
			}
		}
		
		const collectedEnvironments: ILanguageEnvironment[] = Array.from(environmentRegistry.values());
		return collectedEnvironments.sort((a, b) => a.languageName.localeCompare(b.languageName));
	}
}

export const IErdosHelpSearchService = ITopicQueryService;
export type IErdosHelpSearchService = ITopicQueryService;
export const ErdosHelpSearchService = TopicQueryService;
