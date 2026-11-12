/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { AbstractChatView, IChatViewOptions } from './parts/chatView.js';

export const IChatViewFactory = createDecorator<IChatViewFactory>('chatViewFactory');

/**
 * Creates {@link AbstractChatView} instances for the {@link SessionsPart}
 * internal grid. The factory lives in the services layer so that core
 * (`sessions/browser/`) can instantiate chat views without depending on the
 * concrete view implementations, which live in `sessions/contrib/chat/`.
 */
export interface IChatViewFactory {

	readonly _serviceBrand: undefined;

	/** Entry-owned metrics for chat inputs composed outside a chat view, such as automation prompts. */
	readonly inputEditorOptions: IChatViewOptions['inputEditorOptions'];

	/** Paints the optional background behind a session grid. The grid owns the returned presentation. */
	createChatBackground?(container: HTMLElement, instantiationService: IInstantiationService): IDisposable;

	/**
	 * Creates a "new chat" view that lets the user pick a workspace and
	 * start a new chat. This is the view the grid is seeded with on startup. `instantiationService` is the scope of the
	 * surface that shows it, which provides its session host.
	 */
	createNewChatView(isNewChatInSession: boolean, options: IChatViewOptions, instantiationService: IInstantiationService): AbstractChatView;

	/**
	 * Creates a chat view that hosts a chat widget for an active session, with the given options for its input.
	 * `instantiationService` is the scope of the surface that shows it, which provides its session host.
	 */
	createChatView(instantiationService: IInstantiationService, options?: IChatViewOptions): AbstractChatView;
}
