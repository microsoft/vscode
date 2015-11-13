/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Event} from 'vs/base/common/events';

/**
 * All workbench events are listed here. For DOM events, see Monaco.Base.DomUtils.EventType.
 */
export class EventType {

	/**
	 * Event type for when the workbench options change. Listeners should refresh their
	 * assumption on workbench options after this event is emitted.
	 */
	static WORKBENCH_OPTIONS_CHANGED = 'workbenchOptionsChanged';
}

/**
 * Option change events are send when the options in the running instance change.
 */
export class OptionsChangeEvent extends Event {
	public key: string;
	public before: any;
	public after: any;

	constructor(key: string, before: any, after: any, originalEvent?: any) {
		super(originalEvent);

		this.key = key;
		this.before = before;
		this.after = after;
	}
}