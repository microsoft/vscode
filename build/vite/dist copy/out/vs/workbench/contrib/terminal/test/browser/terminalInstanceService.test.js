/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual } from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TerminalInstanceService } from '../../browser/terminalInstanceService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
suite('Workbench - TerminalInstanceService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let terminalInstanceService;
    setup(async () => {
        const instantiationService = workbenchInstantiationService(undefined, store);
        terminalInstanceService = store.add(instantiationService.createInstance(TerminalInstanceService));
    });
    suite('convertProfileToShellLaunchConfig', () => {
        test('should return an empty shell launch config when undefined is provided', () => {
            deepStrictEqual(terminalInstanceService.convertProfileToShellLaunchConfig(), {});
            deepStrictEqual(terminalInstanceService.convertProfileToShellLaunchConfig(undefined), {});
        });
        test('should return the same shell launch config when provided', () => {
            deepStrictEqual(terminalInstanceService.convertProfileToShellLaunchConfig({}), {});
            deepStrictEqual(terminalInstanceService.convertProfileToShellLaunchConfig({ executable: '/foo' }), { executable: '/foo' });
            deepStrictEqual(terminalInstanceService.convertProfileToShellLaunchConfig({ executable: '/foo', cwd: '/bar', args: ['a', 'b'] }), { executable: '/foo', cwd: '/bar', args: ['a', 'b'] });
            deepStrictEqual(terminalInstanceService.convertProfileToShellLaunchConfig({ executable: '/foo' }, '/bar'), { executable: '/foo', cwd: '/bar' });
            deepStrictEqual(terminalInstanceService.convertProfileToShellLaunchConfig({ executable: '/foo', cwd: '/bar' }, '/baz'), { executable: '/foo', cwd: '/baz' });
        });
        test('should convert a provided profile to a shell launch config', () => {
            deepStrictEqual(terminalInstanceService.convertProfileToShellLaunchConfig({
                profileName: 'abc',
                path: '/foo',
                isDefault: true
            }), {
                args: undefined,
                color: undefined,
                cwd: undefined,
                env: undefined,
                executable: '/foo',
                icon: undefined,
                name: undefined
            });
            const icon = URI.file('/icon');
            deepStrictEqual(terminalInstanceService.convertProfileToShellLaunchConfig({
                profileName: 'abc',
                path: '/foo',
                isDefault: true,
                args: ['a', 'b'],
                color: 'color',
                env: { test: 'TEST' },
                icon
            }, '/bar'), {
                args: ['a', 'b'],
                color: 'color',
                cwd: '/bar',
                env: { test: 'TEST' },
                executable: '/foo',
                icon,
                name: undefined
            });
        });
        test('should respect overrideName in profile', () => {
            deepStrictEqual(terminalInstanceService.convertProfileToShellLaunchConfig({
                profileName: 'abc',
                path: '/foo',
                isDefault: true,
                overrideName: true
            }), {
                args: undefined,
                color: undefined,
                cwd: undefined,
                env: undefined,
                executable: '/foo',
                icon: undefined,
                name: 'abc'
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxJbnN0YW5jZVNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvYnJvd3Nlci90ZXJtaW5hbEluc3RhbmNlU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDekMsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBR25HLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRWxHLEtBQUssQ0FBQyxxQ0FBcUMsRUFBRSxHQUFHLEVBQUU7SUFDakQsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUV4RCxJQUFJLHVCQUFpRCxDQUFDO0lBRXRELEtBQUssQ0FBQyxLQUFLLElBQUksRUFBRTtRQUNoQixNQUFNLG9CQUFvQixHQUFHLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3RSx1QkFBdUIsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7SUFDbkcsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsbUNBQW1DLEVBQUUsR0FBRyxFQUFFO1FBQy9DLElBQUksQ0FBQyx1RUFBdUUsRUFBRSxHQUFHLEVBQUU7WUFDbEYsZUFBZSxDQUFDLHVCQUF1QixDQUFDLGlDQUFpQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDakYsZUFBZSxDQUFDLHVC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