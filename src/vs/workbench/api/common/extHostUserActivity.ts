/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Emitter } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { USER_ACTIVITY_KINDS } from '../../services/userActivity/common/userActivityCapture.js';
import { ExtHostUserActivityShape, IMainContext, IUserActivityEventDto, MainContext, MainThreadUserActivityShape } from './extHost.protocol.js';

/** The API event of a recorded one: its kind as the enum, its URI revived. */
export function toApiUserActivityEvent(dto: IUserActivityEventDto): vscode.UserActivityEvent {
	const { uri, ...target } = dto.target;
	return Object.freeze({
		...dto,
		kind: (USER_ACTIVITY_KINDS.indexOf(dto.kind) + 1) as vscode.UserActivityKind,
		target: Object.freeze({ ...target, ...(uri ? { uri: URI.revive(uri) } : {}) }),
		...(dto.detail ? { detail: Object.freeze({ ...dto.detail }) } : {}),
	});
}

/**
 * Proposed API `userActivity`: what the user does in the window, in batches. Capture runs in the
 * window only while an extension of this host listens.
 */
export class ExtHostUserActivity implements ExtHostUserActivityShape {

	private readonly proxy: MainThreadUserActivityShape;

	private readonly _onDidRecordUserActivity = new Emitter<readonly vscode.UserActivityEvent[]>({
		onWillAddFirstListener: () => this.proxy.$setListening(true),
		onDidRemoveLastListener: () => this.proxy.$setListening(false),
	});
	readonly onDidRecordUserActivity = this._onDidRecordUserActivity.event;

	constructor(mainContext: IMainContext) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadUserActivity);
	}

	$acceptUserActivity(events: IUserActivityEventDto[]): void {
		if (events.length) {
			this._onDidRecordUserActivity.fire(Object.freeze(events.map(toApiUserActivityEvent)));
		}
	}
}
