/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { fixedChatOwnerRef, type IAgentChatContext, type IAgentChatOwnerChange, type IAgentChatOwnerRef } from '../../common/agent.js';

/** A host-shaped chat context for provider tests: `owner` owns the chat, which stores under `resource`. */
export function createTestAgentChatContext(owner: URI | IAgentChatOwnerRef, resource: URI): IAgentChatContext {
	const ref = URI.isUri(owner) ? fixedChatOwnerRef(owner) : owner;
	return { sessionSettings: undefined, launchWorkingDirectories: undefined, owner: ref, resource, subagentChatUriFormat: 'shaped' };
}

/** An owner reference a test reassigns, standing in for the host moving a chat to another session. */
export class TestChatOwnerRef implements IAgentChatOwnerRef, IDisposable {
	private readonly _onDidChange = new Emitter<IAgentChatOwnerChange>();
	readonly onDidChange = this._onDidChange.event;

	constructor(private _owner: URI) { }

	get(): URI {
		return this._owner;
	}

	set(owner: URI): void {
		const previous = this._owner;
		this._owner = owner;
		this._onDidChange.fire({ previous, current: owner });
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}
