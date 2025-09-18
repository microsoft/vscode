/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IChatModel, ISerializableChatData } from './chatModel.js';

export interface IStashedChatSession extends ISerializableChatData {
	readonly stashId: string;
	readonly stashTimestamp: number;
	readonly inputValue: string;
	readonly stashTitle?: string;
}

export interface IChatStashService {
	readonly _serviceBrand: undefined;

	/**
	 * Stash a chat session with optional title
	 * @param session The chat session to stash
	 * @param inputValue Current input text when stashing
	 * @param title Optional custom title for the stash
	 * @returns Promise resolving to the stash ID
	 */
	stashSession(session: IChatModel, inputValue: string, title?: string): Promise<string>;

	/**
	 * Get all stashed sessions, ordered by stash timestamp (newest first)
	 */
	getStashedSessions(): Promise<IStashedChatSession[]>;

	/**
	 * Get a specific stashed session by ID
	 * @param stashId The stash ID to retrieve
	 */
	getStashedSession(stashId: string): Promise<IStashedChatSession | undefined>;

	/**
	 * Delete a specific stashed session
	 * @param stashId The stash ID to delete
	 */
	deleteStashedSession(stashId: string): Promise<void>;

	/**
	 * Clear all stashed sessions
	 */
	clearAllStashedSessions(): Promise<void>;

	/**
	 * Update the title of a stashed session
	 * @param stashId The stash ID to update
	 * @param title New title for the stash
	 */
	updateStashTitle(stashId: string, title: string): Promise<void>;

	/**
	 * Get the number of stashed sessions
	 */
	getStashCount(): Promise<number>;
}

export const IChatStashService = createDecorator<IChatStashService>('chatStashService');

const STORAGE_KEY = 'chat.stashedSessions';
const DEFAULT_MAX_STASHES = 10;
const DEFAULT_RETENTION_DAYS = 30;

type ChatStashTelemetryEvent = {
	action: 'stash' | 'resume' | 'delete' | 'clear' | 'view';
	stashCount: number;
	sessionMessageCount?: number;
	hasCustomTitle?: boolean;
	stashAgeInDays?: number;
};

type ChatStashTelemetryClassification = {
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The stash action performed' };
	stashCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of stashed sessions' };
	sessionMessageCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of messages in the stashed session' };
	hasCustomTitle?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the stash has a custom title' };
	stashAgeInDays?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Age of the stash in days' };
	owner: 'sandy081';
	comment: 'Tracks chat session stashing feature usage and performance';
};

export class ChatStashService extends Disposable implements IChatStashService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();
	}

	async stashSession(session: IChatModel, inputValue: string, title?: string): Promise<string> {
		const stashId = generateUuid();
		const stashTimestamp = Date.now();

		// Generate auto title from first user message if no custom title provided
		const autoTitle = this.generateAutoTitle(session);
		const stashTitle = title || autoTitle;

		const stashedSession: IStashedChatSession = {
			...session.toJSON(),
			stashId,
			stashTimestamp,
			inputValue,
			stashTitle
		};

		try {
			const existingStashes = await this.getStashedSessions();
			const updatedStashes = [stashedSession, ...existingStashes];

			// Apply retention policies
			const cleanedStashes = await this.applyRetentionPolicies(updatedStashes);

			await this.saveStashes(cleanedStashes);

			this.logService.info(`ChatStashService: Stashed session ${session.sessionId} as ${stashId}`);

			// Telemetry
			this.telemetryService.publicLog2<ChatStashTelemetryEvent, ChatStashTelemetryClassification>('chatStashAction', {
				action: 'stash',
				stashCount: cleanedStashes.length,
				sessionMessageCount: session.getRequests().length,
				hasCustomTitle: !!title
			});

			return stashId;
		} catch (error) {
			this.logService.error('ChatStashService: Error stashing session', error);
			throw error;
		}
	}

	async getStashedSessions(): Promise<IStashedChatSession[]> {
		try {
			const data = this.storageService.get(STORAGE_KEY, StorageScope.PROFILE, '[]');
			const stashes: IStashedChatSession[] = JSON.parse(data);

			// Sort by stash timestamp (newest first)
			return stashes.sort((a, b) => b.stashTimestamp - a.stashTimestamp);
		} catch (error) {
			this.logService.error('ChatStashService: Error reading stashed sessions', error);
			return [];
		}
	}

	async getStashedSession(stashId: string): Promise<IStashedChatSession | undefined> {
		const stashes = await this.getStashedSessions();
		return stashes.find(stash => stash.stashId === stashId);
	}

	async deleteStashedSession(stashId: string): Promise<void> {
		try {
			const stashes = await this.getStashedSessions();
			const stashToDelete = stashes.find(s => s.stashId === stashId);
			const updatedStashes = stashes.filter(stash => stash.stashId !== stashId);

			await this.saveStashes(updatedStashes);

			this.logService.info(`ChatStashService: Deleted stashed session ${stashId}`);

			// Telemetry
			if (stashToDelete) {
				const stashAgeInDays = Math.floor((Date.now() - stashToDelete.stashTimestamp) / (1000 * 60 * 60 * 24));
				this.telemetryService.publicLog2<ChatStashTelemetryEvent, ChatStashTelemetryClassification>('chatStashAction', {
					action: 'delete',
					stashCount: updatedStashes.length,
					sessionMessageCount: stashToDelete.requests.length,
					hasCustomTitle: !!stashToDelete.stashTitle,
					stashAgeInDays
				});
			}
		} catch (error) {
			this.logService.error('ChatStashService: Error deleting stashed session', error);
			throw error;
		}
	}

	async clearAllStashedSessions(): Promise<void> {
		try {
			const stashes = await this.getStashedSessions();
			const stashCount = stashes.length;

			this.storageService.remove(STORAGE_KEY, StorageScope.PROFILE);

			this.logService.info(`ChatStashService: Cleared all ${stashCount} stashed sessions`);

			// Telemetry
			this.telemetryService.publicLog2<ChatStashTelemetryEvent, ChatStashTelemetryClassification>('chatStashAction', {
				action: 'clear',
				stashCount: 0
			});
		} catch (error) {
			this.logService.error('ChatStashService: Error clearing stashed sessions', error);
			throw error;
		}
	}

	async updateStashTitle(stashId: string, title: string): Promise<void> {
		try {
			const stashes = await this.getStashedSessions();
			const stashIndex = stashes.findIndex(stash => stash.stashId === stashId);

			if (stashIndex === -1) {
				throw new Error(`Stashed session ${stashId} not found`);
			}

			stashes[stashIndex] = { ...stashes[stashIndex], stashTitle: title };
			await this.saveStashes(stashes);

			this.logService.info(`ChatStashService: Updated title for stashed session ${stashId}`);
		} catch (error) {
			this.logService.error('ChatStashService: Error updating stash title', error);
			throw error;
		}
	}

	async getStashCount(): Promise<number> {
		const stashes = await this.getStashedSessions();
		return stashes.length;
	}

	private async saveStashes(stashes: IStashedChatSession[]): Promise<void> {
		const data = JSON.stringify(stashes);
		this.storageService.store(STORAGE_KEY, data, StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private generateAutoTitle(session: IChatModel): string {
		const requests = session.getRequests();
		if (requests.length === 0) {
			return 'Empty Chat Session';
		}

		// Get the first user message and truncate it for the title
		const firstRequest = requests[0];
		const firstMessage = firstRequest.message.text || 'Chat Session';

		// Truncate to 50 characters and add ellipsis if needed
		return firstMessage.length > 50 ? `${firstMessage.substring(0, 47)}...` : firstMessage;
	}

	private async applyRetentionPolicies(stashes: IStashedChatSession[]): Promise<IStashedChatSession[]> {
		const now = Date.now();
		const maxAge = DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000; // Convert days to milliseconds

		// Filter out expired stashes
		const nonExpiredStashes = stashes.filter(stash => {
			const age = now - stash.stashTimestamp;
			return age <= maxAge;
		});

		// Limit to max count (keep newest)
		const limitedStashes = nonExpiredStashes.slice(0, DEFAULT_MAX_STASHES);

		if (limitedStashes.length < stashes.length) {
			this.logService.info(`ChatStashService: Applied retention policy, removed ${stashes.length - limitedStashes.length} stashes`);
		}

		return limitedStashes;
	}
}
