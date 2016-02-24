/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export interface IFoldingRange {
	startLineNumber:number;
	endLineNumber:number;
	isCollapsed?:boolean;
}

export function toString(range: IFoldingRange): string {
	return (range ? range.startLineNumber + '/' + range.endLineNumber : 'null') + range.isCollapsed ? ' (collapsed)' : '';
}