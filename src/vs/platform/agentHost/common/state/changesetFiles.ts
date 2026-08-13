/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derivedObservableWithCache, IObservable } from '../../../../base/common/observable.js';
import { ChangesetFile, ChangesetState, ChangesetStatus } from './sessionState.js';

/** Keeps the last files while a changeset is loading and clears them when unavailable or failed. */
export function createRetainedChangesetFilesObs(
	owner: object,
	changesetStateObs: IObservable<IObservable<ChangesetState | Error | undefined | null>>,
): IObservable<readonly ChangesetFile[] | undefined> {
	return derivedObservableWithCache<readonly ChangesetFile[] | undefined>(owner, (reader, lastValue) => {
		const state = changesetStateObs.read(reader).read(reader);
		if (state === null || state instanceof Error) {
			return [];
		}
		if (state === undefined) {
			return lastValue;
		}
		if (state.status !== ChangesetStatus.Ready && lastValue !== undefined) {
			return lastValue;
		}
		return state.files;
	});
}
