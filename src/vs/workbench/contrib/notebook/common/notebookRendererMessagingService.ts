/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const INotebookRendererMessagingService = createDecorator<INotebookRendererMessagingService>('INotebookRendererMessagingService');

export interface INotebookRendererMessagingService {
	readonly _serviceBrand: undefined;

	/**
	 * Event that fires when a message should be posted to extension hosts.
	 */
	onShouldPostMessage: Event<{ editorId: string; rendererId: string; message: unknown }>;

	/**
	 * Prepares messaging for the given renderer ID.
	 */
	prepare(rendererId: string): void;
	/**
	 * Gets messaging scoped for a specific editor.
	 */
	getScoped(editorId: string): IScopedRendererMessaging;

	/**
	 * Called when the main thread gets a message for a renderer.
	 */
	fireDidReceiveMessage(editorId: string, rendererId: string, message: unknown): void;
}

export interface IScopedRendererMessaging {
	/**
	 * Event that fires when a message is received.
	 */
	onDidReceiveMessage: Event<{ rendererId: string; message: unknown }>;

	/**
	 * Sends a message to an extension from a renderer.
	 */
	postMessage(rendererId: string, message: unknown): void;
}
