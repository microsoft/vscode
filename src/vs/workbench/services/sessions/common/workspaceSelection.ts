/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ISessionProject } from './session.js';

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

export interface ISelectWorkspaceOptions {
	readonly providerId?: string;
	readonly preferDevContainer?: boolean;
	readonly selectionOrigin?: WorkspaceSelectionOrigin;
	/** Only replace an automatic default in a fresh, empty composer. */
	readonly isDefault?: boolean;
	/** The workspace to select, whose default folder is the selected folder; without one, the folder is selected on its own. */
	readonly project?: ISessionProject;
	/** The folders the session works in, the selected folder first; without them, it works in the selected folder only. */
	readonly folders?: readonly URI[];
}

export interface ISelectNoWorkspaceOptions {
	readonly userSelection?: boolean;
	readonly preserveNavigation?: boolean;
	/** Only replace an automatic default in a fresh, empty composer. */
	readonly isDefault?: boolean;
}

export type WorkspaceSelectionResult = 'applied' | 'notReady' | 'preserved';

export type WorkspaceHistoryLoadState = 'loading' | 'loaded' | 'error';
export type WorkspaceSessionFallbackState = 'idle' | 'pending' | 'completed' | 'error' | 'disabled';
export type WorkspaceArgumentKind = 'none' | 'local' | 'devContainer' | 'remote' | 'other';
/** Kind of VS Code remote that hosts the workspace argument; for Dev Containers, the host of the container's source folder. */
export type WorkspaceArgumentRemoteKind = 'none' | 'ssh' | 'wsl' | 'tunnel' | 'codespaces' | 'attachedContainer' | 'other';

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
