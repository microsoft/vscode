/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ok, strictEqual } from 'assert';
import { SandboxedCommandLinePresenter } from '../../browser/tools/commandLinePresenter/sandboxedCommandLinePresenter.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';
suite('SandboxedCommandLinePresenter', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    const createPresenter = (enabled = true) => {
        instantiationService = workbenchInstantiationService({}, store);
        instantiationService.stub(ITerminalSandboxService, {
            _serviceBrand: undefined,
            isEnabled: async () => enabled,
            wrapCommand: command => ({
                command,
                isSandboxWrapped: false,
            }),
            getSandboxConfigPath: async () => '/tmp/sandbox.json',
            getTempDir: () => undefined,
            setNeedsForceUpdateConfigFile: () => { },
        });
        return instantiationService.createInstance(SandboxedCommandLinePresenter);
    };
    test('should return command line when sandboxing is enabled', async () => {
        const presenter = createPresenter();
        const commandLine = 'ELECTRON_RUN_AS_NODE=1 "/path/to/electron" "/path/to/srt/cli.js" TMPDIR=/tmp --settings "/tmp/sandbox.json" -c "echo hello"';
        const result = await presenter.present({
            commandLine: { forDisplay: commandLine },
            shell: 'bash',
            os: 3 /* OperatingSystem.Linux */
        });
        ok(result);
        strictEqual(result.commandLine, commandLine);
        strictEqual(result.language, undefined);
        strictEqual(result.languageDisplayName, undefined);
    });
    test('should return command line for non-sandboxed command when enabled', async () => {
        const presenter = createPresenter();
        const commandLine = 'echo hello';
        const result = await presenter.present({
            commandLine: { forDisplay: commandLine },
            shell: 'bash',
            os: 3 /* OperatingSystem.Linux */
        });
        ok(result);
        strictEqual(result.commandLine, commandLine);
        strictEqual(result.language, undefined);
        strictEqual(result.languageDisplayName, undefined);
    });
    test('should use forDisplay over original when both are provided', async () => {
        const presenter = createPresenter();
        const result = await presenter.present({
            commandLine: { original: 'cd /some/path && ls -lh', forDisplay: 'ls -lh' },
            shell: 'bash',
            os: 3 /* OperatingSystem.Linux */
        });
        ok(result);
        strictEqual(result.commandLine, 'ls -lh');
    });
    test('should return undefined when sandboxing is disabled', async () => {
        const presenter = createPresenter(false);
        const result = await presenter.present({
            commandLine: { forDisplay: 'ELECTRON_RUN_AS_NODE=1 "/path/to/electron" "/path/to/srt/cli.js" TMPDIR=/tmp --settings "/tmp/sandbox.json" -c "echo hello"' },
            shell: 'bash',
            os: 3 /* OperatingSystem.Linux */
        });
        strictEqual(result, undefined);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2FuZGJveGVkQ29tbWFuZExpbmVQcmVzZW50ZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvc2FuZGJveGVkQ29tbWFuZExpbmVQcmVzZW50ZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsRUFBRSxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN6QyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSwyRUFBMkUsQ0FBQztBQUUxSCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUV0RyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVqRixLQUFLLENBQUMsK0JBQStCLEVBQUUsR0FBRyxFQUFFO0lBQzNDLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFDeEQsSUFBSSxvQkFBOEMsQ0FBQztJQUVuRCxNQUFNLGVBQWUsR0FBRyxDQUFDLFVBQW1CLElBQUksRUFBRSxFQUFFO1FBQ25ELG9CQUFvQixHQUFHLDZCQUE2QixDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNoRSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLEVBQUU7WUFDbEQsYUFBYSxFQUFFLFNBQVM7WUFDeEIsU0FBUyxFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsT0FBTztZQUM5QixXQUFXLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QixPQUFPO2dCQUNQLGdCQUFnQixFQUFFLEtBQUs7YUFDdkIsQ0FBQztZQUNGLG9CQUFv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