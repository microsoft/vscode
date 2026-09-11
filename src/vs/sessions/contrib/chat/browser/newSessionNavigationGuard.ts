/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader } from '../../../../base/common/observable.js';
import type { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { INewSessionComposer, NewSessionWorkspacePreselectionSource } from './newSessionComposerService.js';

/** Cancels delayed folder navigation when a draft or a newer navigation takes precedence. */
export class NewSessionNavigationGuard extends Disposable {
	private readonly _cancellation = this._register(new CancellationTokenSource());
	readonly token = this._cancellation.token;
	private _expectedSessionId: string | undefined;
	private _openingComposer = false;

	constructor(
		private readonly activeSession: IObservable<IActiveSession | undefined>,
		private readonly activeComposer: IObservable<INewSessionComposer | undefined>,
		private readonly automatic = false,
	) {
		super();
		this._expectedSessionId = activeSession.get()?.sessionId;
		this._register(autorun(reader => this._check(reader)));
	}

	get canNavigate(): boolean {
		this._check();
		return !this.token.isCancellationRequested;
	}

	private _check(reader?: IReader): void {
		const session = this.activeSession.read(reader);
		const composer = this.activeComposer.read(reader);
		const hasInput = composer?.hasInput.read(reader);
		const userWorkspace = composer?.workspacePreselectionSource === NewSessionWorkspacePreselectionSource.User;
		const changedSession = session?.sessionId !== this._expectedSessionId;
		if (hasInput || (this.automatic && userWorkspace) || (!this._openingComposer && changedSession && (!this.automatic || session?.isCreated.read(reader)))) {
			this.cancel();
		}
	}

	/** A folderless composer activation is synchronous; observe it as part of the same intent. */
	openComposer<T>(open: () => T): T {
		this._openingComposer = true;
		try {
			return open();
		} finally {
			this._expectedSessionId = this.activeSession.get()?.sessionId;
			this._openingComposer = false;
			this._check();
		}
	}

	cancel(): void {
		this._cancellation.cancel();
	}

	override dispose(): void {
		this.cancel();
		super.dispose();
	}
}
