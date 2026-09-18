/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ChatEditingSessionState, IChatEditingSession, IEditSessionEntryDiff, IModifiedFileEntry, ModifiedFileEntryState } from '../../common/editing/chatEditingService.js';
import { IChatRequestDisablement } from '../../common/model/chatModel.js';

/** Prefilled editing state for rendering real edit pills in tests and fixtures. */
export class MockChatEditingSession extends mock<IChatEditingSession>() {
	override readonly onDidDispose = Event.None;
	override readonly isGlobalEditingSession = false;
	override readonly supportsKeepUndo = false;
	override readonly state = constObservable(ChatEditingSessionState.Idle);
	override readonly requestDisablement = constObservable<IChatRequestDisablement[]>([]);
	override readonly entries;

	constructor(private readonly diffs: readonly IEditSessionEntryDiff[], private readonly options: { readonly synchronousDiffs?: boolean } = {}) {
		super();
		this.entries = constObservable(diffs.map(diff => new class extends mock<IModifiedFileEntry>() {
			override readonly modifiedURI = diff.modifiedURI;
			override readonly originalURI = diff.originalURI;
			override readonly state = constObservable(ModifiedFileEntryState.Accepted);
			override readonly isCurrentlyBeingModifiedBy = constObservable(undefined);
		}()));
	}

	override getEntry(uri: URI): IModifiedFileEntry | undefined {
		return this.entries.get().find(entry => isEqual(entry.modifiedURI, uri));
	}

	override readEntry(uri: URI): IModifiedFileEntry | undefined {
		return this.getEntry(uri);
	}

	override getEntryDiffBetweenStops(uri: URI) {
		const diff = this.diffs.find(diff => isEqual(diff.modifiedURI, uri));
		if (this.options.synchronousDiffs) {
			// Finalized diffs are cached by the real session and handed out as constant observables.
			return constObservable(diff);
		}
		const result = observableValue<IEditSessionEntryDiff | undefined>(this, undefined);
		// The real editing session computes fresh snapshot diffs asynchronously.
		queueMicrotask(() => {
			result.set(diff, undefined);
		});
		return result;
	}

	override getDiffsForFilesInRequest() {
		return constObservable(this.diffs);
	}

	// eslint-disable-next-line local/code-must-use-super-dispose -- The mock base has no disposal implementation.
	override dispose(): void { }
}
