/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export enum Level {
	Ignore = 1,
	Warning = 2,
	Error = 4
}

export function toLevel(level: string):Level {
	switch (level) {
		case 'ignore': return Level.Ignore;
		case 'warning': return Level.Warning;
		case 'error': return Level.Error;
	}
	return null;
}