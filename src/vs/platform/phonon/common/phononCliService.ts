/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IPhononCliService = createDecorator<IPhononCliService>('phononCliService');

export interface IPhononCliTextEvent {
	readonly requestId: string;
	readonly text: string;
}

export interface IPhononCliCompleteEvent {
	readonly requestId: string;
	readonly result?: string;
	readonly error?: string;
	readonly costUsd?: number;
	readonly numTurns?: number;
}

export interface IPhononCliService {
	readonly _serviceBrand: undefined;

	/**
	 * Send a prompt to the claude CLI and stream the response.
	 * Returns immediately; text arrives via onDidReceiveText events.
	 */
	sendPrompt(requestId: string, prompt: string, model: string, systemPrompt: string, maxTokens: number): Promise<void>;

	/**
	 * Cancel a running request.
	 */
	cancelRequest(requestId: string): Promise<void>;

	/**
	 * Check if the claude CLI is available on PATH.
	 */
	isAvailable(): Promise<boolean>;

	/**
	 * Fired for each text chunk received from the CLI (real-time streaming).
	 */
	readonly onDidReceiveText: Event<IPhononCliTextEvent>;

	/**
	 * Fired when a request completes (success or error).
	 */
	readonly onDidComplete: Event<IPhononCliCompleteEvent>;
}
