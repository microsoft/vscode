/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { AgentFinderRestProvider } from '../../../../../platform/agentFinder/common/agentFinderRestProvider.js';
import { AgentFinderSource } from '../../../../../platform/agentFinder/common/agentFinderSource.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { CustomizationMarketplaceMediaType, CustomizationMarketplaceService, IAgentFinderMarketplaceService, ICustomizationMarketplaceCursor, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService, ICustomizationMarketplaceSource, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../common/constants.js';
import { CopilotConnectorsMarketplaceSource, ICopilotConnectorsService } from './copilotConnectorsService.js';

export class AgentFinderMarketplaceWorkbenchService implements IAgentFinderMarketplaceService {
	declare readonly _serviceBrand: undefined;
	private readonly service: Lazy<CustomizationMarketplaceService>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.service = new Lazy(() => {
			const provider = instantiationService.createInstance(AgentFinderRestProvider);
			return new CustomizationMarketplaceService([new AgentFinderSource(provider, provider)]);
		});
	}

	query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		if (this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsUnifiedMarketplaceEnabled) !== true || token.isCancellationRequested) {
			return Promise.reject(new CancellationError());
		}
		return this.service.value.query(options, token);
	}
}

class AgentFinderMarketplaceSource implements ICustomizationMarketplaceSource {
	readonly id = 'agentFinder';

	constructor(private readonly service: IAgentFinderMarketplaceService) { }

	async query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		const page = await this.service.query({
			query: options.query,
			mediaType: options.mediaType,
			pageSize: options.pageSize,
			cursor: options.cursor ? parseCursor(options.cursor) : undefined,
		}, token);
		return {
			items: page.items.map(item => {
				const { sourceId, ...entry } = item;
				if (sourceId !== this.id) {
					throw new Error(`Unexpected built-in marketplace source '${sourceId}'.`);
				}
				return entry;
			}),
			total: page.total,
			nextCursor: page.nextCursor ? JSON.stringify(page.nextCursor) : undefined,
		};
	}
}

export class CustomizationMarketplaceWorkbenchService implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;
	private readonly service: CustomizationMarketplaceService;

	constructor(
		@IAgentFinderMarketplaceService agentFinderService: IAgentFinderMarketplaceService,
		@ICopilotConnectorsService copilotConnectorsService: ICopilotConnectorsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		this.service = new CustomizationMarketplaceService([
			new AgentFinderMarketplaceSource(agentFinderService),
			new CopilotConnectorsMarketplaceSource(copilotConnectorsService, configurationService),
		]);
	}

	query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		if (this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsUnifiedMarketplaceEnabled) !== true || token.isCancellationRequested) {
			return Promise.reject(new CancellationError());
		}
		return this.service.query(options, token);
	}
}

function parseCursor(raw: string): ICustomizationMarketplaceCursor {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		throw new Error('Invalid built-in marketplace cursor.');
	}
	if (!isRecord(value)) {
		throw new Error('Invalid built-in marketplace cursor.');
	}
	const query = value.query;
	const pageSize = value.pageSize;
	const mediaType = value.mediaType;
	const rawSources = value.sources;
	if (typeof query !== 'string' || typeof pageSize !== 'number' || !Number.isSafeInteger(pageSize) ||
		!isMarketplaceMediaType(mediaType) || !Array.isArray(rawSources)) {
		throw new Error('Invalid built-in marketplace cursor.');
	}
	const sources = rawSources.map(source => {
		if (!isRecord(source)) {
			throw new Error('Invalid built-in marketplace cursor.');
		}
		const id = source.id;
		const cursor = source.cursor;
		const total = source.total;
		if (typeof id !== 'string' || (cursor !== undefined && typeof cursor !== 'string') ||
			(total !== undefined && (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0))) {
			throw new Error('Invalid built-in marketplace cursor.');
		}
		return {
			id,
			cursor,
			total,
		};
	});
	return {
		query,
		mediaType,
		pageSize,
		sources,
	};
}

function isMarketplaceMediaType(value: unknown): value is CustomizationMarketplaceMediaType | undefined {
	return value === undefined || typeof value === 'string' && Object.values(CustomizationMarketplaceMediaType).some(mediaType => mediaType === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
