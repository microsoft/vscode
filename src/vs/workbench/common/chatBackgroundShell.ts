/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../base/common/observable.js';

/** Provider-neutral metadata for an active background shell owned by a chat. */
export interface IChatBackgroundShell {
	/** Identity of the entry, unique within the chat. */
	readonly id: string;
	/** The agent's own ID for the shell, when it reports one. Only shown to the user. */
	readonly shellId?: string;
	readonly description: string;
	readonly command: string;
	readonly startedAt: string;
	/** Whether the shell is tied to its agent's lifetime, when the agent reports it. */
	readonly attachmentMode?: 'attached' | 'detached';
	/** The shell's live output, when the agent can show it. Only subscribes while read. */
	readonly output?: IObservable<ChatBackgroundShellOutput>;
	/** Stops the shell, when the agent offers it. Resolves false when the shell had already finished. */
	readonly stop?: () => Promise<boolean>;
}

/** What a background shell's live output view shows. */
export type ChatBackgroundShellOutput =
	| { readonly status: 'loading' }
	| { readonly status: 'running'; readonly text: string }
	| { readonly status: 'exited'; readonly text: string; readonly exitCode?: number }
	| { readonly status: 'unavailable'; readonly message: string };
