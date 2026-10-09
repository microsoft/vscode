/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IChatSession, IChatSessionContentProvider } from '../../../common/chatSessionsService.js';

/** Catalog entries remain readable without restoring the disabled provider's transcript. */
export class PolicyUnavailableAgentHostContentProvider implements IChatSessionContentProvider {
	async provideChatSessionContent(resource: URI, token: CancellationToken): Promise<IChatSession> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return new PolicyUnavailableAgentHostSession(resource);
	}
}

class PolicyUnavailableAgentHostSession extends Disposable implements IChatSession {
	readonly history = [];
	readonly isReadOnly = constObservable(true);
	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	constructor(readonly sessionResource: URI) {
		super();
	}

	override dispose(): void {
		this._onWillDispose.fire();
		super.dispose();
	}
}
