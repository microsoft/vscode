/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../base/common/observable.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionFile } from '../../../services/sessions/common/session.js';

/** Shared stable empty result so "no session / no files" doesn't churn observers. */
const EMPTY_SESSION_FILES: readonly ISessionFile[] = Object.freeze([]);

/**
 * View model backing the "Other Files" section in the changes view. Exposes
 * the files created/edited/deleted outside the workspace by the active session.
 */
export class SessionFilesViewModel extends Disposable {
	readonly sessionFilesObs: IObservable<readonly ISessionFile[]>;

	constructor(
		@ISessionsService sessionsService: ISessionsService,
	) {
		super();

		// The underlying `externalChanges` observable carries its own structural
		// equality, so when it is unchanged it returns the same array reference
		// and this derived does not propagate. The shared empty constant keeps
		// the "no session" case equally stable.
		this.sessionFilesObs = derived(this, reader => {
			const activeSession = sessionsService.activeSession.read(reader);
			return activeSession?.externalChanges?.read(reader) ?? EMPTY_SESSION_FILES;
		});
	}
}
