/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { autorunWithStore } from 'vs/base/common/observable';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { AudioCue, IAudioCueService } from 'vs/workbench/contrib/audioCues/browser/audioCueService';
import { IDebugService, IDebugSession } from 'vs/workbench/contrib/debug/common/debug';

export class AudioCueLineDebuggerContribution
	extends Disposable
	implements IWorkbenchContribution {

	constructor(
		@IDebugService debugService: IDebugService,
		@IAudioCueService private readonly audioCueService: IAudioCueService,
	) {
		super();

		this._register(autorunWithStore((reader, store) => {
			if (!audioCueService.isEnabled(AudioCue.onDebugBreak).read(reader)) {
				return;
			}

			const sessionDisposables = new Map<IDebugSession, IDisposable>();
			store.add(toDisposable(() => {
				sessionDisposables.forEach(d => d.dispose());
				sessionDisposables.clear();
			}));

			store.add(
				debugService.onDidNewSession((session) =>
					sessionDisposables.set(session, this.handleSession(session))
				)
			);

			store.add(debugService.onDidEndSession(session => {
				sessionDisposables.get(session)?.dispose();
				sessionDisposables.delete(session);
			}));

			debugService
				.getModel()
				.getSessions()
				.forEach((session) =>
					sessionDisposables.set(session, this.handleSession(session))
				);

		}, 'subscribe to debug sessions'));
	}

	private handleSession(session: IDebugSession): IDisposable {
		return session.onDidChangeState(e => {
			const stoppedDetails = session.getStoppedDetails();
			const BREAKPOINT_STOP_REASON = 'breakpoint';
			if (stoppedDetails && stoppedDetails.reason === BREAKPOINT_STOP_REASON) {
				this.audioCueService.playAudioCue(AudioCue.onDebugBreak);
			}
		});

	}
}
