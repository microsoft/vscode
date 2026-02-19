/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';

export const ipcBrowserViewGroupChannelName = 'browserViewGroup';

/**
 * Fired when a browser view is added to or removed from a group.
 */
export interface IBrowserViewGroupViewEvent {
	/** The ID of the browser view that was added or removed. */
	readonly viewId: string;
}

/**
 * A browser view group - an isolated collection of browser views.
 *
 * This interface is shared between the main-process entity and remote proxies.
 */
export interface IBrowserViewGroup extends IDisposable {
	readonly id: string;

	readonly onDidAddView: Event<IBrowserViewGroupViewEvent>;
	readonly onDidRemoveView: Event<IBrowserViewGroupViewEvent>;
	readonly onDidDestroy: Event<void>;

	addView(viewId: string): Promise<void>;
	removeView(viewId: string): Promise<void>;
	getDebugWebSocketEndpoint(): Promise<string>;
}

/**
 * Common service for managing browser view groups across processes.
 *
 * A browser view group is an isolated collection of browser views that can be
 * independently exposed to different services or CDP clients.
 *
 * This interface is consumed via {@link ProxyChannel}.
 * The main-process implementation is {@link BrowserViewGroupMainService}.
 */
export interface IBrowserViewGroupService {

	// Dynamic events - one per group instance, keyed by group ID.
	onDynamicDidAddView(groupId: string): Event<IBrowserViewGroupViewEvent>;
	onDynamicDidRemoveView(groupId: string): Event<IBrowserViewGroupViewEvent>;
	onDynamicDidDestroy(groupId: string): Event<void>;

	/**
	 * Create a new browser view group.
	 * @returns The id of the newly created group.
	 */
	createGroup(): Promise<string>;

	/**
	 * Destroy a browser view group.
	 * Views in the group are **not** destroyed - they are simply detached.
	 * @param groupId The group identifier.
	 */
	destroyGroup(groupId: string): Promise<void>;

	/**
	 * Add a browser view to a group.
	 * A view can belong to multiple groups simultaneously.
	 * @param groupId The group identifier.
	 * @param viewId The browser view identifier.
	 */
	addViewToGroup(groupId: string, viewId: string): Promise<void>;

	/**
	 * Remove a browser view from a group.
	 * @param groupId The group identifier.
	 * @param viewId The browser view identifier.
	 */
	removeViewFromGroup(groupId: string, viewId: string): Promise<void>;

	/**
	 * Get a short-lived CDP WebSocket endpoint URL for a specific group.
	 * The returned URL contains a single-use token.
	 * @param groupId The group identifier.
	 */
	getDebugWebSocketEndpoint(groupId: string): Promise<string>;
}
