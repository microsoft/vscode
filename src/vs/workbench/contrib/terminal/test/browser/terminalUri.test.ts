/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { getTerminalResourcesFromDragEvent, IPartialDragEvent } from 'vs/workbench/contrib/terminal/browser/terminalUri';

function fakeDragEvent(data: string): IPartialDragEvent {
	return {
		dataTransfer: {
			getData: () => {
				return data;
			}
		}
	};
}

suite('getTerminalResourcesFromDragEvent', () => {
	test('should give undefined when no terminal resources is in event', () => {
		deepStrictEqual(
			getTerminalResourcesFromDragEvent(fakeDragEvent(''))?.map(e => e.toString()),
			undefined
		);
	});
	test('should give undefined when an empty terminal resources array is in event', () => {
		deepStrictEqual(
			getTerminalResourcesFromDragEvent(fakeDragEvent('[]'))?.map(e => e.toString()),
			undefined
		);
	});
	test('should return terminal resource when event contains one', () => {
		deepStrictEqual(
			getTerminalResourcesFromDragEvent(fakeDragEvent('["vscode-terminal:/1626874386474/3"]'))?.map(e => e.toString()),
			['vscode-terminal:/1626874386474/3']
		);
	});
	test('should return multiple terminal resources when event contains multiple', () => {
		deepStrictEqual(
			getTerminalResourcesFromDragEvent(fakeDragEvent('["vscode-terminal:/foo/1","vscode-terminal:/bar/2"]'))?.map(e => e.toString()),
			['vscode-terminal:/foo/1', 'vscode-terminal:/bar/2']
		);
	});
});
