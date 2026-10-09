/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface TaskProgressMessage {
	readonly type: 'taskProgress';
	readonly checked: number;
	readonly total: number;
	readonly title: string;
	readonly label: string;
	readonly language: string;
}

export function isTaskProgressMessage(message: unknown): message is TaskProgressMessage {
	if (typeof message !== 'object' || message === null) {
		return false;
	}
	const candidate = message as Partial<TaskProgressMessage>;
	return candidate.type === 'taskProgress'
		&& typeof candidate.checked === 'number'
		&& Number.isSafeInteger(candidate.checked)
		&& typeof candidate.total === 'number'
		&& Number.isSafeInteger(candidate.total)
		&& candidate.checked >= 0
		&& candidate.checked <= candidate.total
		&& typeof candidate.title === 'string'
		&& typeof candidate.label === 'string'
		&& typeof candidate.language === 'string';
}
