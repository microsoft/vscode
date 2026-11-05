/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const enum AgentWorkbenchLayout {
	Mobile = 'mobile',
	Desktop = 'desktop',
}

export const ISessionsHostLayoutService = createDecorator<ISessionsHostLayoutService>('sessionsHostLayoutService');

/**
 * The layout capabilities that sessions features need from the window hosting
 * them. Plain part visibility, focus and containers come from
 * `IWorkbenchLayoutService`; this contract only covers the host-specific
 * presentation and editor-part reveal behaviour, so features using it do not
 * depend on the Agents window workbench.
 */
export interface ISessionsHostLayoutService {
	readonly _serviceBrand: undefined;

	/** The concrete presentation of the host selected at startup. */
	readonly agentWorkbenchLayout: AgentWorkbenchLayout;

	/**
	 * Reveals the (possibly hidden) editor part as an explicit user action. Use for
	 * deliberate opens like the session-header Changes pill or opening a file diff.
	 */
	revealEditorPartExplicitly(): void;

	/**
	 * Suppresses the automatic editor part show/hide that normally fires when
	 * editors open or close. Use this around programmatic editor operations
	 * (e.g. applying a working set) so that the editor part visibility is not
	 * changed as a side-effect. Dispose the returned handle to release the
	 * suppression. Calls nest via a counter.
	 */
	suppressEditorPartAutoVisibility(): IDisposable;

	/** Whether programmatic editor operations currently suppress automatic editor part visibility. */
	isEditorPartAutoVisibilitySuppressed(): boolean;

	/**
	 * The docked side pane (editor area and auxiliary bar shown beside the
	 * session) of hosts that have one, or `undefined` for hosts without it.
	 */
	readonly sidePane?: ISessionsHostSidePane;
}

/**
 * Optional side-pane capability of a {@link ISessionsHostLayoutService}. Only
 * hosts that dock the editor area beside the sessions provide it.
 */
export interface ISessionsHostSidePane {
	/** Whether the docked editor pane is visible. */
	isEditorPaneVisible(): boolean;

	/** Hides the side pane as one semantic transition. */
	hideSidePane(): void;
}
