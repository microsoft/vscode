/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AbstractChatView, IChatViewOptions } from '../../../browser/parts/chatView.js';

export const IChatViewFactory = createDecorator<IChatViewFactory>('chatViewFactory');

/**
 * Creates {@link AbstractChatView} instances for the {@link SessionsPart}
 * internal grid. The factory lives in the services layer so that core
 * (`sessions/browser/`) can instantiate chat views without depending on the
 * concrete view implementations, which live in `sessions/contrib/chat/`.
 */
export interface IChatViewFactory {

	readonly _serviceBrand: undefined;

	/**
	 * Creates a "new chat" view that lets the user pick a workspace and
	 * start a new chat. This is the view the grid is seeded with on startup.
	 */
	createNewChatView(isNewChatInSession: boolean, options: IChatViewOptions): AbstractChatView;

	/**
	 * Creates a chat view that hosts a chat widget for an active session.
	 */
	createChatView(): AbstractChatView;
}
