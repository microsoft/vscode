/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {Event} from 'vs/base/common/events';

/**
 * All workbench events are listed here.
 */
export class EventType {

	/**
	 * Event type for when a resources encoding changes.
	 */
	static RESOURCE_ENCODING_CHANGED = 'resourceEncodingChanged';
}

export class ResourceEvent extends Event {
	public resource: URI;

	constructor(resource: URI, originalEvent?: any) {
		super(originalEvent);

		this.resource = resource;
	}
}