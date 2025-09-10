/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IChatModel } from './chatModel.js';
import { ChatAgentLocation } from './constants.js';

export const IChatModelService = createDecorator<IChatModelService>('chatModelService');

/**
 * Service responsible for managing chat session models and their lifecycle.
 * This service handles loading sessions from various sources and provides
 * a centralized place for session model management.
 */
export interface IChatModelService {
	readonly _serviceBrand: undefined;

	/**
	 * Load a chat session from a resource URI.
	 * Handles both local sessions and content provider sessions.
	 */
	loadSessionForResource(resource: URI, location: ChatAgentLocation, token: CancellationToken): Promise<IChatModel | undefined>;

	/**
	 * Track active content provider sessions
	 */
	getContentProviderSession(chatSessionType: string, sessionId: string): IChatModel | undefined;

	/**
	 * Dispose all sessions of a specific type
	 */
	disposeSessionsOfType(chatSessionType: string): void;
}

/**
 * Telemetry events for chat model operations
 */
export type ChatModelLoadEvent = {
	sessionType: 'local' | 'contentProvider';
	success: boolean;
	duration: number;
	sessionId: string;
	location: string;
};

export type ChatModelLoadClassification = {
	sessionType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Type of session being loaded (local or content provider).' };
	success: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the session loaded successfully.' };
	duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time taken to load session in milliseconds.' };
	sessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Anonymized session identifier for correlation.' };
	location: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Location where session is being loaded (Chat, EditorInline, etc.).' };
	owner: 'microsoft';
	comment: 'Tracks chat session loading performance and success rates.';
};

export type ChatModelErrorEvent = {
	operation: 'loadSession' | 'parseUri' | 'createModel';
	errorMessage: string;
	sessionType?: string;
	duration?: number;
};

export type ChatModelErrorClassification = {
	operation: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The operation that failed.' };
	errorMessage: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The error message.' };
	sessionType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Type of session when error occurred.' };
	duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time until failure in milliseconds.' };
	owner: 'microsoft';
	comment: 'Tracks chat model service errors for reliability monitoring.';
};