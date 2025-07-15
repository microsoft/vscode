/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

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
	receiveMessage(editorId: string | undefined, rendererId: string, message: unknown): Promise<boolean>;
}

export interface IScopedRendererMessaging extends IDisposable {
	/**
	 * Method called when a message is received. Should return a boolean
	 * indicating whether a renderer received it.
	 */
	receiveMessageHandler?: (rendererId: string, message: unknown) => Promise<boolean>;

	/**
	 * Sends a message to an extension from a renderer.
	 */
	postMessage(rendererId: string, message: unknown): void;
}
