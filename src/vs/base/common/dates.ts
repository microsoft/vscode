/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');

export function since(date: Date): string {
	var seconds = (new Date().getTime() - date.getTime()) / 1000;
	if (seconds < 60) {
		return nls.localize('diff.seconds.verbose', "just now");
	}

	var minutes = seconds / 60;
	if (minutes < 60) {
		return Math.floor(minutes) === 1 ? nls.localize('diff.minute.verbose', "1 minute ago") : nls.localize('diff.minutes.verbose', "{0} minutes ago", Math.floor(minutes));
	}

	var hours = minutes / 60;
	if (hours < 24) {
		return Math.floor(hours) === 1 ? nls.localize('diff.hour.verbose', "1 hour ago") : nls.localize('diff.hours.verbose', "{0} hours ago", Math.floor(hours));
	}

	var days = hours / 24;
	if (Math.floor(days) === 1) {
		return nls.localize('diff.days.yesterday', "yesterday");
	}

	if (days > 6 && days < 8) {
		return nls.localize('diff.days.week', "a week ago");
	}

	if (days > 30 && days < 40) {
		return nls.localize('diff.days.month', "a month ago");
	}

	return nls.localize('diff.days.verbose', "{0} days ago", Math.floor(days));
}