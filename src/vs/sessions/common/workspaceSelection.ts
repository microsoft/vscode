/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../base/common/uri.js';

export const enum WorkspaceSelectionOrigin {
	None = 'none',
	CheckedWorkspace = 'checkedWorkspace',
	AgentsRecent = 'agentsRecent',
	VSCodeRecent = 'vscodeRecent',
	VSCodeWorkspace = 'vscodeWorkspace',
	ExistingSessions = 'existingSessions',
	WindowOpen = 'windowOpen',
	WindowContext = 'windowContext',
	RestoredDraft = 'restoredDraft',
	SessionSync = 'sessionSync',
	Programmatic = 'programmatic',
	User = 'user',
}

export type WorkspaceHistoryLoadState = 'loading' | 'loaded' | 'error';
export type WorkspaceSessionFallbackState = 'idle' | 'pending' | 'completed' | 'error' | 'disabled';
export type WorkspaceArgumentKind = 'none' | 'local' | 'devContainer' | 'remote' | 'other';

/** Selection and lookup state at the instant it is read, not a guarantee that a session can run. */
export interface IWorkspaceSelectionSnapshot {
	/** For local comparisons only; never include this URI in telemetry. */
	readonly folderUri: URI | undefined;
	readonly origin: WorkspaceSelectionOrigin;
	readonly state: 'none' | 'noWorkspace' | 'selected' | 'unresolved';
	readonly historyState: WorkspaceHistoryLoadState;
	readonly sessionFallbackState: WorkspaceSessionFallbackState;
	readonly registeredProviderCount: number;
}
