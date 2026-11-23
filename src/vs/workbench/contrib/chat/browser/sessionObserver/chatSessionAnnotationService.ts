/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatSessionAnnotation, IChatSessionAnnotationService } from '../../common/sessionObserver/chatSessionObserver.js';

/** Annotations on sessions' timelines (proposed API `chatSessionAnnotations`), per owner, in memory. */
export class ChatSessionAnnotationService extends Disposable implements IChatSessionAnnotationService {
	declare readonly _serviceBrand: undefined;

	private readonly bySession = new ResourceMap<Map<string, readonly IChatSessionAnnotation[]>>();
	private readonly _onDidChangeAnnotations = this._register(new Emitter<URI>());
	readonly onDidChangeAnnotations = this._onDidChangeAnnotations.event;

	setAnnotations(owner: string, session: URI, annotations: readonly IChatSessionAnnotation[]): void {
		let owners = this.bySession.get(session);
		if (!annotations.length) {
			if (!owners?.delete(owner)) {
				return;
			}
			if (!owners.size) {
				this.bySession.delete(session);
			}
		} else {
			if (!owners) {
				owners = new Map();
				this.bySession.set(session, owners);
			}
			owners.set(owner, [...annotations]);
		}
		this._onDidChangeAnnotations.fire(session);
	}

	getAnnotations(session: URI): readonly IChatSessionAnnotation[] {
		const owners = this.bySession.get(session);
		return owners ? [...owners.values()].flat().sort((a, b) => a.timestamp - b.timestamp) : [];
	}

	clearOwner(owner: string): void {
		for (const [session, owners] of [...this.bySession]) {
			if (owners.delete(owner)) {
				if (!owners.size) {
					this.bySession.delete(session);
				}
				this._onDidChangeAnnotations.fire(session);
			}
		}
	}
}
