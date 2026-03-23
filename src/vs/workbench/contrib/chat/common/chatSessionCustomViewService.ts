/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';

export const IChatSessionCustomViewService = createDecorator<IChatSessionCustomViewService>('chatSessionCustomViewService');

/**
 * Context key that is `true` when the agent session custom view pane is active.
 * Used by the view container to toggle between ChatViewPane and AgentSessionCustomViewPane.
 */
export const IsCustomSessionViewContext = new RawContextKey<boolean>('isCustomSessionView', false, localize('isCustomSessionView', "Whether the custom session view is active"));

/**
 * Data provided to the header renderer for displaying session-specific information.
 */
export interface IChatSessionCustomHeaderData {
	/**
	 * The session resource URI.
	 */
	readonly sessionResource: URI;

	/**
	 * Display label, e.g. the worker instance name.
	 */
	readonly label: string;

	/**
	 * Optional description text.
	 */
	readonly description?: string;

	/**
	 * Optional icon identifier (Codicon ID).
	 */
	readonly iconId?: string;

	/**
	 * Optional status indicator: 'active' | 'idle' | 'error'.
	 */
	readonly status?: 'active' | 'idle' | 'error';

	/**
	 * Optional additional key-value pairs to display.
	 */
	readonly details?: ReadonlyArray<{ readonly key: string; readonly value: string }>;
}

/**
 * Renderer that provides custom header content for the agent session custom view.
 */
export interface IChatSessionCustomHeaderRenderer extends IDisposable {
	/**
	 * Render header content into the given container for the specified session.
	 * Returns a disposable to clean up the rendered content.
	 */
	renderHeader(container: HTMLElement, data: IChatSessionCustomHeaderData): IDisposable;

	/**
	 * Optional event fired when the header height changes (e.g. dynamic content).
	 */
	readonly onDidChangeHeight?: Event<void>;
}

/**
 * Service that manages custom header renderers for the agent session custom view.
 * Extensions (or internal code) register renderers keyed by session type (URI scheme).
 */
export interface IChatSessionCustomViewService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when a header renderer is registered or unregistered.
	 */
	readonly onDidChangeRenderers: Event<void>;

	/**
	 * Register a custom header renderer for a given session type.
	 * @param sessionType The session type key (typically the URI scheme).
	 * @param renderer The renderer to register.
	 * @returns A disposable that unregisters the renderer.
	 */
	registerHeaderRenderer(sessionType: string, renderer: IChatSessionCustomHeaderRenderer): IDisposable;

	/**
	 * Get the registered header renderer for a session type, if any.
	 */
	getHeaderRenderer(sessionType: string): IChatSessionCustomHeaderRenderer | undefined;

	/**
	 * Event fired when the header data for a session changes.
	 */
	readonly onDidChangeHeaderData: Event<URI>;

	/**
	 * Set or update the header data for a specific session.
	 */
	setHeaderData(sessionResource: URI, data: IChatSessionCustomHeaderData): void;

	/**
	 * Get the current header data for a session.
	 */
	getHeaderData(sessionResource: URI): IChatSessionCustomHeaderData | undefined;

	/**
	 * Open a session in the custom view pane.
	 * Sets the IsCustomSessionViewContext, opens the AgentSessionCustomViewPane,
	 * and loads the session into it.
	 */
	openInCustomView(sessionResource: URI): Promise<void>;

	/**
	 * Close the custom view and switch back to the regular chat view.
	 * Resets the IsCustomSessionViewContext.
	 */
	closeCustomView(): void;
}
