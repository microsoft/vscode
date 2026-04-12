/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getInstanceFromResource, getTerminalResourcesFromDragEvent, getTerminalUri } from '../../browser/terminalUri.js';
function fakeDragEvent(data) {
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
            deepStrictEqual(getTerminalResourcesFromDragEvent(fakeDragEvent(''))?.map(e => e.toString()), undefined);
        });
        test('should give undefined when an empty terminal resources array is in event', () => {
            deepStrictEqual(getTerminalResourcesFromDragEvent(fakeDragEvent('[]'))?.map(e => e.toString()), undefined);
        });
        test('should return terminal resource when event contains one', () => {
            deepStrictEqual(getTerminalResourcesFromDragEvent(fakeDragEvent('["vscode-terminal:/1626874386474/3"]'))?.map(e => e.toString()), ['vscode-terminal:/1626874386474/3']);
        });
        test('should return multiple terminal resources when event contains multiple', () => {
            deepStrictEqual(getTerminalResourcesFromDragEvent(fakeDragEvent('["vscode-terminal:/foo/1","vscode-terminal:/bar/2"]'))?.map(e => e.toString()), ['vscode-terminal:/foo/1', 'vscode-terminal:/bar/2']);
        });
    });
    suite('getInstanceFromResource', () => {
        test('should return undefined if there is no match', () => {
            strictEqual(getInstanceFromResource([
                { resource: getTerminalUri('workspace', 2, 'title') }
            ], getTerminalUri('workspace', 1, 'title')), undefined);
        });
        test('should return a result if there is a match', () => {
            const instance = { resource: getTerminalUri('workspace', 2, 'title') };
            strictEqual(getInstanceFromResource([
                { resource: getTerminalUri('workspace', 1, 'title') },
                instance,
                { resource: getTerminalUri('workspace', 3, 'title') }
            ], getTerminalUri('workspace', 2, 'title')), instance);
        });
        test('should ignore the fragment', () => {
            const instance = { resource: getTerminalUri('workspace', 2, 'title') };
            strictEqual(getInstanceFromResource([
                { resource: getTerminalUri('workspace', 1, 'title') },
                instance,
                { resource: getTerminalUri('workspace', 3, 'title') }
            ], getTerminalUri('workspace', 2, 'does not match!')), instance);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxVcmkudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvYnJvd3Nlci90ZXJtaW5hbFVyaS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ3RELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxpQ0FBaUMsRUFBRSxjQUFjLEVBQXFCLE1BQU0sOEJBQThCLENBQUM7QUFFN0ksU0FBUyxhQUFhLENBQUMsSUFBWTtJQUNsQyxPQUFPO1FBQ04sWUFBWSxFQUFFO1lBQ2IsT0FBTyxFQUFFLEdBQUcsRUFBRTtnQkFDYixPQUFPLElBQUksQ0FBQztZQUNiLENBQUM7U0FDRDtLQUNELENBQUM7QUFDSCxDQUFDO0FBRUQsS0FBSyxDQUFDLGFBQWEsRUFBRSxHQUFHLEVBQUU7SUFDekIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsbUNBQW1DLEVBQUUsR0FBRyxFQUFFO1FBQy9DLElBQUksQ0FBQyw4REFBOEQsRUFBRSxHQUFHLEVBQUU7WUFDekUsZUFBZSxDQUNkLGlDQUFpQyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxFQUM1RSxTQUFTLENBQ1QsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLDBFQUEwRSxFQUFFLEdBQUcsRUFBRTtZQUNyRixlQUFlLENBQ2QsaUNBQWlDLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFD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