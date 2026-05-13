/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { IBrowserViewOwner } from './browserView.js';
import { CDPEvent, CDPRequest, CDPResponse } from './cdp/types.js';

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
	readonly onCDPMessage: Event<CDPResponse | CDPEvent>;

	addView(viewId: string): Promise<void>;
	removeView(viewId: string): Promise<void>;
	sendCDPMessage(msg: CDPRequest): Promise<void>;
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
	onDynamicCDPMessage(groupId: string): Event<CDPResponse | CDPEvent>;

	/**
	 * Create a new browser view group.
	 * @param owner The owner of the group's lifecycle.
	 * @returns The id of the newly created group.
	 */
	createGroup(owner: IBrowserViewOwner): Promise<string>;

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
	 * Send a CDP message to a group's browser proxy.
	 * @param groupId The group identifier.
	 * @param message The CDP request.
	 */
	sendCDPMessage(groupId: string, message: CDPRequest): Promise<void>;
}
