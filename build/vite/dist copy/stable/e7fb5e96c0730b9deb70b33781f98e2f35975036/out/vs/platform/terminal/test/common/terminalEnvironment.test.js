/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { OS } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { collapseTildePath, sanitizeCwd, escapeNonWindowsPath } from '../../common/terminalEnvironment.js';
suite('terminalEnvironment', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('collapseTildePath', () => {
        test('should return empty string for a falsy path', () => {
            strictEqual(collapseTildePath('', '/foo', '/'), '');
            strictEqual(collapseTildePath(undefined, '/foo', '/'), '');
        });
        test('should return path for a falsy user home', () => {
            strictEqual(collapseTildePath('/foo', '', '/'), '/foo');
            strictEqual(collapseTildePath('/foo', undefined, '/'), '/foo');
        });
        test('should not collapse when user home isn\'t present', () => {
            strictEqual(collapseTildePath('/foo', '/bar', '/'), '/foo');
            strictEqual(collapseTildePath('C:\\foo', 'C:\\bar', '\\'), 'C:\\foo');
        });
        test('should collapse with Windows separators', () => {
            strictEqual(collapseTildePath('C:\\foo\\bar', 'C:\\foo', '\\'), '~\\bar');
            strictEqual(collapseTildePath('C:\\foo\\bar', 'C:\\foo\\', '\\'), '~\\bar');
            strictEqual(collapseTildePath('C:\\foo\\bar\\baz', 'C:\\foo\\', '\\'), '~\\bar\\baz');
            strictEqual(collapseTildePath('C:\\foo\\bar\\baz', 'C:\\foo', '\\'), '~\\bar\\baz');
        });
        test('should collapse mixed case with Windows separators', () => {
            strictEqual(collapseTildePath('c:\\foo\\bar', 'C:\\foo', '\\'), '~\\bar');
            strictEqual(collapseTildePath('C:\\foo\\bar\\baz', 'c:\\foo', '\\'), '~\\bar\\baz');
        });
        test('should collapse with Posix separators', () => {
            strictEqual(collapseTildePath('/foo/bar', '/foo', '/'), '~/bar');
            strictEqual(collapseTildePath('/foo/bar', '/foo/', '/'), '~/bar');
            strictEqual(collapseTildePath('/foo/bar/baz', '/foo', '/'), '~/bar/baz');
            strictEqual(collapseTildePath('/foo/bar/baz', '/foo/', '/'), '~/bar/baz');
        });
    });
    suite('sanitizeCwd', () => {
        if (OS === 1 /* OperatingSystem.Windows */) {
            test('should make the Windows drive letter uppercase', () => {
                strictEqual(sanitizeCwd('c:\\foo\\bar'), 'C:\\foo\\bar');
            });
        }
        test('should remove any wrapping quotes', () => {
            strictEqual(sanitizeCwd('\'/foo/bar\''), '/foo/bar');
            strictEqual(sanitizeCwd('"/foo/bar"'), '/foo/bar');
        });
    });
    suite('escapeNonWindowsPath', () => {
        test('should escape for bash/sh/zsh shells', () => {
            strictEqual(escapeNonWindowsPath('/foo/bar', "bash" /* PosixShellType.Bash */), '\'/foo/bar\'');
            strictEqual(escapeNonWindowsPath('/foo/bar\'baz', "bash" /* PosixShellType.Bash */), '\'/foo/bar\\\'baz\'');
            strictEqual(escapeNonWindowsPath('/foo/bar"baz', "bash" /* PosixShellType.Bash */), '\'/foo/bar"baz\'');
            strictEqual(escapeNonWindowsPath('/foo/bar\'baz"qux', "bash" /* PosixShellType.Bash */), '$\'/foo/bar\\\'baz"qux\'');
            strictEqual(escapeNonWindowsPath('/foo/bar', "sh" /* PosixShellType.Sh */), '\'/foo/bar\'');
            strictEqual(escapeNonWindowsPath('/foo/bar\'baz', "sh" /* PosixShellType.Sh */), '\'/foo/bar\\\'baz\'');
            strictEqual(escapeNonWindowsPath('/foo/bar', "zsh" /* PosixShellType.Zsh */), '\'/foo/bar\'');
            strictEqual(escapeNonWindowsPath('/foo/bar\'baz', "zsh" /* PosixShellType.Zsh */), '\'/foo/bar\\\'baz\'');
        });
        test('should escape for git bash', () => {
            strictEqual(escapeNonWindowsPath('/foo/bar', "gitbash" /* WindowsShellType.GitBash */), '\'/foo/bar\'');
            strictEqual(escapeNonWindowsPath('/foo/bar\'baz', "gitbash" /* WindowsShellType.GitBash */), '\'/foo/bar\\\'baz\'');
            strictEqual(escapeNonWindowsPath('/foo/bar"baz', "gitbash" /* WindowsShellType.GitBash */), '\'/foo/bar"baz\'');
        });
        test('should escape for fish shell', () => {
            strictEqual(escapeNonWindowsPath('/foo/bar', "fish" /* PosixShellType.Fish */), '\'/foo/bar\'');
            strictEqual(escapeNonWindowsPath('/foo/bar\'baz', "fish" /* PosixShellType.Fish */), '\'/foo/bar\\\'baz\'');
            strictEqual(escapeNonWindowsPath('/foo/bar"baz', "fish" /* PosixShellType.Fish */), '\'/foo/bar"baz\'');
            strictEqual(escapeNonWindowsPath('/foo/bar\'baz"qux', "fish" /* PosixShellType.Fish */), '"/foo/bar\'baz\\"qux"');
        });
        test('should escape for PowerShell', () => {
            strictEqual(escapeNonWindowsPath('/foo/bar', "pwsh" /* GeneralShellType.PowerShell */), '\'/foo/bar\'');
            strictEqual(escapeNonWindowsPath('/foo/bar\'baz', "pwsh" /* GeneralShellType.PowerShell */), '\'/foo/bar\'\'baz\'');
            strictEqual(escapeNonWindowsPath('/foo/bar"baz', "pwsh" /* GeneralShellType.PowerShell */), '\'/foo/bar"baz\'');
            strictEqual(escapeNonWindowsPath('/foo/bar\'baz"qux', "pwsh" /* GeneralShellType.PowerShell */), '"/foo/bar\'baz`"qux"');
        });
        test('should default to POSIX escaping for unknown shells', () => {
            strictEqual(escapeNonWindowsPath('/foo/bar'), '\'/foo/bar\'');
            strictEqual(escapeNonWindowsPath('/foo/bar\'baz'), '\'/foo/bar\\\'baz\'');
        });
        test('should remove dangerous characters', () => {
            strictEqual(escapeNonWindowsPath('/foo/bar$(echo evil)', "bash" /* PosixShellType.Bash */), '\'/foo/bar(echo evil)\'');
            strictEqual(escapeNonWindowsPath('/foo/bar`whoami`', "bash" /* PosixShellType.Bash */), '\'/foo/barwhoami\'');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFbnZpcm9ubWVudC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGVybWluYWwvdGVzdC9jb21tb24vdGVybWluYWxFbnZpcm9ubWVudC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDckMsT0FBTyxFQUFtQixFQUFFLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsV0FBVyxFQUFFLG9CQUFvQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFHM0csS0FBSyxDQUFDLHFCQUFxQixFQUFFLEdBQUcsRUFBRTtJQUNqQyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLEVBQUU7UUFDL0IsSUFBSSxDQUFDLDZDQUE2QyxFQUFFLEdBQUcsRUFBRTtZQUN4RCxXQUFXLENBQUMsaUJBQWlCLENBQUMsRUFBRSxFQUFFLE1BQU0sRUFBRSxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNwRCxXQUFXLENBQUMsaUJBQWlCLENBQUMsU0FBUyxFQUFFLE1BQU0sRUFBRSxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM1RCxDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQywwQ0FBMEMsRUFBRSxHQUFHLEVBQUU7WUFDckQsV0FBVyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxFQUFFLEVBQUUsR0FBRyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDeEQsV0FBVyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxDQUFD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