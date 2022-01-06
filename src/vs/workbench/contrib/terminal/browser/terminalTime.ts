/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function getCurrentTimestamp(): string {
	const currentTime = new Date();
	return `${currentTime.getMonth() + 1}-${currentTime.getDate()}-${currentTime.getHours()}-${currentTime.getMinutes()}-${currentTime.getSeconds()}-${currentTime.getMilliseconds()} `;
}
export function getTimeSinceCommand(timeOfCommand: string): string {
	const timeNow = getCurrentTimestamp();
	const now = timeNow.split('-');
	const command = timeOfCommand.split('-');
	let i = 0;
	while (now[i] === command[i] && i < command.length) {
		i++;
	}
	switch (i) {
		case 0:
			return `${i} months ago`;
		case 1:
			return `${i} days ago`;
		case 2:
			return `${i} hours ago`;
		case 3:
			return `${i} minutes ago`;
		case 4:
			return `${i} seconds ago`;
	}
	return 'a long time ago';
}
