/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { CommandLineBackgroundDetachRewriter } from '../../browser/tools/commandLineRewriter/commandLineBackgroundDetachRewriter.js';
suite('CommandLineBackgroundDetachRewriter', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let configurationService;
    let rewriter;
    function createOptions(command, shell, os, isBackground) {
        return {
            commandLine: command,
            cwd: undefined,
            shell,
            os,
            isBackground,
        };
    }
    setup(() => {
        configurationService = new TestConfigurationService();
        configurationService.setUserConfiguration("chat.tools.terminal.detachBackgroundProcesses" /* TerminalChatAgentToolsSettingId.DetachBackgroundProcesses */, true);
        instantiationService = workbenchInstantiationService({
            configurationService: () => configurationService
        }, store);
        rewriter = store.add(instantiationService.createInstance(CommandLineBackgroundDetachRewriter));
    });
    test('should return undefined for foreground commands', () => {
        strictEqual(rewriter.rewrite(createOptions('echo hello', '/bin/bash', 3 /* OperatingSystem.Linux */, false)), undefined);
    });
    test('should return undefined when isBackground is not set', () => {
        strictEqual(rewriter.rewrite(createOptions('echo hello', '/bin/bash', 3 /* OperatingSystem.Linux */)), undefined);
    });
    test('should return undefined when setting is disabled', () => {
        configurationService.setUserConfiguration("chat.tools.terminal.detachBackgroundProcesses" /* TerminalChatAgentToolsSettingId.DetachBackgroundProcesses */, false);
        strictEqual(rewriter.rewrite(createOptions('python3 app.py', '/bin/bash', 3 /* OperatingSystem.Linux */, true)), undefined);
    });
    suite('POSIX (bash)', () => {
        test('should wrap with nohup on Linux', () => {
            deepStrictEqual(rewriter.rewrite(createOptions('python3 app.py', '/bin/bash', 3 /* OperatingSystem.Linux */, true)), {
                rewritten: 'nohup python3 app.py &',
                reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
                forDisplay: 'python3 app.py',
            });
        });
        test('should wrap with nohup on macOS', () => {
            deepStrictEqual(rewriter.rewrite(createOptions('flask run', '/bin/bash', 2 /* OperatingSystem.Macintosh */, true)), {
                rewritten: 'nohup flask run &',
                reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
                forDisplay: 'flask run',
            });
        });
    });
    suite('POSIX (zsh)', () => {
        test('should wrap with nohup', () => {
            deepStrictEqual(rewriter.rewrite(createOptions('node server.js', '/bin/zsh', 3 /* OperatingSystem.Linux */, true)), {
                rewritten: 'nohup node server.js &',
                reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
                forDisplay: 'node server.js',
            });
        });
    });
    suite('POSIX (fish)', () => {
        test('should wrap with nohup', () => {
            deepStrictEqual(rewriter.rewrite(createOptions('ruby app.rb', '/usr/bin/fish', 3 /* OperatingSystem.Linux */, true)), {
                rewritten: 'nohup ruby app.rb &',
                reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
                forDisplay: 'ruby app.rb',
            });
        });
    });
    suite('Windows (PowerShell)', () => {
        test('should wrap with Start-Process for pwsh', () => {
            deepStrictEqual(rewriter.rewrite(createOptions('python app.py', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', 1 /* OperatingSystem.Windows */, true)), {
                rewritten: 'Start-Process -WindowStyle Hidden -FilePath "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -ArgumentList "-NoProfile", "-Command", "python app.py"',
                reasoning: 'Wrapped background command with Start-Process to survive terminal shutdown',
                forDisplay: 'python app.py',
            });
        });
        test('should wrap with Start-Process for Windows PowerShell', () => {
            deepStrictEqual(rewriter.rewrite(createOptions('node server.js', 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 1 /* OperatingSystem.Windows */, true)), {
                rewritten: 'Start-Process -WindowStyle Hidden -FilePath "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -ArgumentList "-NoProfile", "-Command", "node server.js"',
                reasoning: 'Wrapped background command with Start-Process to survive terminal shutdown',
                forDisplay: 'node server.js',
            });
        });
        test('should escape double quotes in PowerShell commands', () => {
            deepStrictEqual(rewriter.rewrite(createOptions('echo "hello world"', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', 1 /* OperatingSystem.Windows */, true)), {
                rewritten: 'Start-Process -WindowStyle Hidden -FilePath "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -ArgumentList "-NoProfile", "-Command", "echo \\"hello world\\""',
                reasoning: 'Wrapped background command with Start-Process to survive terminal shutdown',
                forDisplay: 'echo "hello world"',
            });
        });
        test('should return undefined for non-PowerShell Windows shell', () => {
            strictEqual(rewriter.rewrite(createOptions('echo hello', 'cmd.exe', 1 /* OperatingSystem.Windows */, true)), undefined);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVCYWNrZ3JvdW5kRGV0YWNoUmV3cml0ZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvY29tbWFuZExpbmVCYWNrZ3JvdW5kRGV0YWNoUmV3cml0ZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUV0RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUV0RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSxnRkFBZ0YsQ0FBQztBQUlySSxLQUFLLENBQUMscUNBQXFDLEVBQUUsR0FBRyxFQUFFO0lBQ2pELE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsSUFBSSxvQkFBOEMsQ0FBQztJQUNuRCxJQUFJLG9CQUE4QyxDQUFDO0lBQ25ELElBQUksUUFBNkMsQ0FBQztJQUVsRCxTQUFTLGFBQWEsQ0FBQyxPQUFlLEVBQUUsS0FBYSxFQUFFLEVBQW1CLEVBQUUsWUFBc0I7UUFDakcsT0FBTztZQUNOLFdBQVcsRUFBRSxPQUFPO1lBQ3BCLEdBQUcsRUFBRSxTQUFTO1lBQ2QsS0FBSztZQUNMLEVBQUU7WUFDRixZQUFZO1NBQ1osQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1Ysb0JBQW9CLEdBQUcsSUFBSSx3QkFBd0IsRUFBRSxDQUFDO1FBQ3RELG9CQUFv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