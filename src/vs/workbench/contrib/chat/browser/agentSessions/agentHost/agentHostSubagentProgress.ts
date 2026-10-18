/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { IChatProgress, IChatToolInvocation } from '../../../common/chatService/chatService.js';

function needsInput(part: IChatProgress): boolean {
	const state = part.kind === 'toolInvocation' ? part.state.get().type : undefined;
	return state === IChatToolInvocation.StateKind.WaitingForConfirmation
		|| state === IChatToolInvocation.StateKind.WaitingForAuthentication
		|| state === IChatToolInvocation.StateKind.WaitingForPostApproval;
}

export function isUnstartedSubagent(part: IChatProgress): boolean {
	if ((part.kind !== 'toolInvocation' && part.kind !== 'toolInvocationSerialized')
		|| part.subAgentInvocationId
		|| part.toolSpecificData?.kind !== 'subagent'
		|| part.toolSpecificData.hasStarted !== false) {
		return false;
	}
	return !needsInput(part);
}

/** Appends subagent entries when their children start without reserving earlier positions in the stream. */
export class AgentHostSubagentProgress extends Disposable {
	private readonly pending = this._register(new DisposableMap<IChatToolInvocation>());

	constructor(private readonly sink: (parts: IChatProgress[]) => void) {
		super();
	}

	publish(parts: IChatProgress[]): void {
		const ready = parts.filter(part => {
			if (!isUnstartedSubagent(part)) {
				return true;
			}
			if (part.kind === 'toolInvocation' && !this.pending.has(part)) {
				const tracker = new MutableDisposable();
				this.pending.set(part, tracker);
				let published = false;
				tracker.value = autorun(reader => {
					part.state.read(reader);
					const hasStarted = part.toolSpecificData?.kind === 'subagent' && part.toolSpecificData.hasStarted === true;
					if (!published && (hasStarted || needsInput(part))) {
						published = true;
						this.sink([part]);
						queueMicrotask(() => this.pending.deleteAndDispose(part));
					}
				});
			}
			return false;
		});
		if (ready.length > 0) {
			this.sink(ready);
		}
	}
}
