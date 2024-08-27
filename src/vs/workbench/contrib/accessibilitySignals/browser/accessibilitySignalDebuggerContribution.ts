/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { autorunWithStore, observableFromEvent } from 'vs/base/common/observable';
import { IAccessibilitySignalService, AccessibilitySignal, AccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService, IDebugSession } from 'vs/workbench/contrib/debug/common/debug';

export class AccessibilitySignalLineDebuggerContribution
	extends Disposable
	implements IWorkbenchContribution {

	constructor(
		@IDebugService debugService: IDebugService,
		@IAccessibilitySignalService private readonly accessibilitySignalService: AccessibilitySignalService,
	) {
		super();

		const isEnabled = observableFromEvent(this,
			accessibilitySignalService.onSoundEnabledChanged(AccessibilitySignal.onDebugBreak),
			() => accessibilitySignalService.isSoundEnabled(AccessibilitySignal.onDebugBreak)
		);
		this._register(autorunWithStore((reader, store) => {
			/** @description subscribe to debug sessions */
			if (!isEnabled.read(reader)) {
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

			store.add(debugService.onDidEndSession(({ session }) => {
				sessionDisposables.get(session)?.dispose();
				sessionDisposables.delete(session);
			}));

			debugService
				.getModel()
				.getSessions()
				.forEach((session) =>
					sessionDisposables.set(session, this.handleSession(session))
				);
		}));
	}

	private handleSession(session: IDebugSession): IDisposable {
		return session.onDidChangeState(e => {
			const stoppedDetails = session.getStoppedDetails();
			const BREAKPOINT_STOP_REASON = 'breakpoint';
			if (stoppedDetails && stoppedDetails.reason === BREAKPOINT_STOP_REASON) {
				this.accessibilitySignalService.playSignal(AccessibilitySignal.onDebugBreak);
			}
		});
	}
}
