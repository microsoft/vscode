/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { API } from '../../api';

export enum ActivityBarPosition {
	LEFT = 0,
	RIGHT = 1
}

export class ActivityBar {

	constructor(private api: API) {
		// noop
	}

	public async getActivityBar(position: ActivityBarPosition): Promise<void> {
		let positionClass: string;

		if (position === ActivityBarPosition.LEFT) {
			positionClass = 'left';
		} else if (position === ActivityBarPosition.RIGHT) {
			positionClass = 'right';
		} else {
			throw new Error('No such position for activity bar defined.');
		}

		return this.api.waitForElement(`.part.activitybar.${positionClass}`);
	}
}