/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getInstanceFromResource, getTerminalResourcesFromDragEvent, getTerminalUri, IPartialDragEvent } from '../../browser/terminalUri.js';

function fakeDragEvent(data: string): IPartialDragEvent {
	return {
		dataTransfer: {
			getData: () => {
				return data;
			}
		}
	};
}

suite('terminalUri', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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
	suite('getInstanceFromResource', () => {
		test('should return undefined if there is no match', () => {
			strictEqual(
				getInstanceFromResource([
					{ resource: getTerminalUri('workspace', 2, 'title') }
				], getTerminalUri('workspace', 1)),
				undefined
			);
		});
		test('should return a result if there is a match', () => {
			const instance = { resource: getTerminalUri('workspace', 2, 'title') };
			strictEqual(
				getInstanceFromResource([
					{ resource: getTerminalUri('workspace', 1, 'title') },
					instance,
					{ resource: getTerminalUri('workspace', 3, 'title') }
				], getTerminalUri('workspace', 2)),
				instance
			);
		});
		test('should ignore the fragment', () => {
			const instance = { resource: getTerminalUri('workspace', 2, 'title') };
			strictEqual(
				getInstanceFromResource([
					{ resource: getTerminalUri('workspace', 1, 'title') },
					instance,
					{ resource: getTerminalUri('workspace', 3, 'title') }
				], getTerminalUri('workspace', 2, 'does not match!')),
				instance
			);
		});
	});
});
