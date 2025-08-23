// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as sinon from 'sinon';
import { instance, mock, when } from 'ts-mockito';
import { Terminal } from 'vscode';
import { ApplicationEnvironment } from '../../../../client/common/application/applicationEnvironment';
import { WorkspaceService } from '../../../../client/common/application/workspace';
import { PlatformService } from '../../../../client/common/platform/platformService';
import { IPlatformService } from '../../../../client/common/platform/types';
import { CurrentProcess } from '../../../../client/common/process/currentProcess';
import { SettingsShellDetector } from '../../../../client/common/terminal/shellDetectors/settingsShellDetector';
import { TerminalNameShellDetector } from '../../../../client/common/terminal/shellDetectors/terminalNameShellDetector';
import { UserEnvironmentShellDetector } from '../../../../client/common/terminal/shellDetectors/userEnvironmentShellDetector';
import { VSCEnvironmentShellDetector } from '../../../../client/common/terminal/shellDetectors/vscEnvironmentShellDetector';
import { ShellIdentificationTelemetry, TerminalShellType } from '../../../../client/common/terminal/types';
import { getNamesAndValues } from '../../../../client/common/utils/enum';
import { OSType } from '../../../../client/common/utils/platform';

suite('Shell Detectors', () => {
    let platformService: IPlatformService;
    let currentProcess: CurrentProcess;
    let workspaceService: WorkspaceService;
    let appEnv: ApplicationEnvironment;

    // Dummy data for testing.
    const shellPathsAndIdentification = new Map<string, TerminalShellType>();
    shellPathsAndIdentification.set('c:\\windows\\system32\\cmd.exe', TerminalShellType.commandPrompt);
    shellPathsAndIdentification.set('c:\\windows\\system32\\bash.exe', TerminalShellType.bash);
    shellPathsAndIdentification.set('c:\\windows\\system32\\wsl.exe', TerminalShellType.wsl);
    shellPathsAndIdentification.set('c:\\windows\\system32\\gitbash.exe', TerminalShellType.gitbash);
    shellPathsAndIdentification.set('/usr/bin/bash', TerminalShellType.bash);
    shellPathsAndIdentification.set('c:\\cygwin\\bin\\bash.exe', TerminalShellType.bash);
    shellPathsAndIdentification.set('c:\\cygwin64\\bin\\bash.exe', TerminalShellType.bash);
    shellPathsAndIdentification.set('/usr/bin/zsh', TerminalShellType.zsh);
    shellPathsAndIdentification.set('c:\\cygwin\\bin\\zsh.exe', TerminalShellType.zsh);
    shellPathsAndIdentification.set('c:\\cygwin64\\bin\\zsh.exe', TerminalShellType.zsh);
    shellPathsAndIdentification.set('/usr/bin/ksh', TerminalShellType.ksh);
    shellPathsAndIdentification.set('c:\\windows\\system32\\powershell.exe', TerminalShellType.powershell);
    shellPathsAndIdentification.set('c:\\windows\\system32\\pwsh.exe', TerminalShellType.powershellCore);
    shellPathsAndIdentification.set('C:\\Program Files\\nu\\bin\\nu.EXE', TerminalShellType.nushell);
    shellPathsAndIdentification.set('/usr/microsoft/xxx/powershell/powershell', TerminalShellType.powershell);
    shellPathsAndIdentification.set('/usr/microsoft/xxx/powershell/pwsh', TerminalShellType.powershellCore);
    shellPathsAndIdentification.set('/usr/bin/fish', TerminalShellType.fish);
    shellPathsAndIdentification.set('c:\\windows\\system32\\shell.exe', TerminalShellType.other);
    shellPathsAndIdentification.set('/usr/bin/shell', TerminalShellType.other);
    shellPathsAndIdentification.set('/usr/bin/csh', TerminalShellType.cshell);
    shellPathsAndIdentification.set('/usr/bin/tcsh', TerminalShellType.tcshell);
    shellPathsAndIdentification.set('/usr/bin/xonsh', TerminalShellType.xonsh);
    shellPathsAndIdentification.set('/usr/bin/xonshx', TerminalShellType.other);

    let telemetryProperties: ShellIdentificationTelemetry;

    setup(() => {
        telemetryProperties = {
            failed: true,
            shellIdentificationSource: 'default',
            terminalProvided: false,
            hasCustomShell: undefined,
            hasShellInEnv: undefined,
        };
        platformService = mock(PlatformService);
        workspaceService = mock(WorkspaceService);
        currentProcess = mock(CurrentProcess);
        appEnv = mock(ApplicationEnvironment);
    });
    test('Test Priority of detectors', async () => {
        expect(new TerminalNameShellDetector().priority).to.equal(4);
        expect(new VSCEnvironmentShellDetector(instance(appEnv)).priority).to.equal(3);
        expect(new SettingsShellDetector(instance(workspaceService), instance(platformService)).priority).to.equal(2);
        expect(new UserEnvironmentShellDetector(instance(currentProcess), instance(platformService)).priority).to.equal(
            1,
        );
    });
    test('Test identification of Terminal Shells (base class method)', async () => {
        const shellDetector = new TerminalNameShellDetector();
        shellPathsAndIdentification.forEach((shellType, shellPath) => {
            expect(shellDetector.identifyShellFromShellPath(shellPath)).to.equal(
                shellType,
                `Incorrect Shell Type for path '${shellPath}'`,
            );
        });
    });
    test('Identify shell based on name of terminal', async () => {
        const shellDetector = new TerminalNameShellDetector();
        shellPathsAndIdentification.forEach((shellType, shellPath) => {
            expect(shellDetector.identify(telemetryProperties, { name: shellPath } as any)).to.equal(
                shellType,
                `Incorrect Shell Type for name '${shellPath}'`,
            );
        });

        expect(shellDetector.identify(telemetryProperties, undefined)).to.equal(
            undefined,
            'Should be undefined when there is no temrinal',
        );
    });
    test('Identify shell based on custom VSC shell path', async () => {
        const shellDetector = new VSCEnvironmentShellDetector(instance(appEnv));
        shellPathsAndIdentification.forEach((shellType, shellPath) => {
            when(appEnv.shell).thenReturn('defaultshellPath');
            expect(
                shellDetector.identify(telemetryProperties, ({
                    creationOptions: { shellPath },
                } as unknown) as Terminal),
            ).to.equal(shellType, `Incorrect Shell Type from identifyShellByTerminalName, for path '${shellPath}'`);
        });
    });
    test('Identify shell based on VSC API', async () => {
        const shellDetector = new VSCEnvironmentShellDetector(instance(appEnv));
        shellPathsAndIdentification.forEach((shellType, shellPath) => {
            when(appEnv.shell).thenReturn(shellPath);
            expect(shellDetector.identify(telemetryProperties, { name: shellPath } as any)).to.equal(
                shellType,
                `Incorrect Shell Type from identifyShellByTerminalName, for path '${shellPath}'`,
            );
        });

        when(appEnv.shell).thenReturn(undefined as any);
        expect(shellDetector.identify(telemetryProperties, undefined)).to.equal(
            undefined,
            'Should be undefined when vscode.env.shell is undefined',
        );
        expect(telemetryProperties.failed).to.equal(false);
    });
    test('Identify shell based on VSC Settings', async () => {
        const shellDetector = new SettingsShellDetector(instance(workspaceService), instance(platformService));
        shellPathsAndIdentification.forEach((shellType, shellPath) => {
            // Assume the same paths are stored in user settings, we should still be able to identify the shell.
            shellDetector.getTerminalShellPath = () => shellPath;
            expect(shellDetector.identify(telemetryProperties, {} as any)).to.equal(
                shellType,
                `Incorrect Shell Type for path '${shellPath}'`,
            );
        });
    });
    getNamesAndValues<OSType>(OSType).forEach((os) => {
        test(`Get shell path from settings (OS ${os.name})`, async () => {
            const shellPathInSettings = 'some value';
            const shellDetector = new SettingsShellDetector(instance(workspaceService), instance(platformService));
            const getStub = sinon.stub();
            const config = { get: getStub } as any;
            getStub.returns(shellPathInSettings);
            when(workspaceService.getConfiguration('terminal.integrated.shell')).thenReturn(config);
            when(platformService.osType).thenReturn(os.value);

            const shellPath = shellDetector.getTerminalShellPath();

            expect(shellPath).to.equal(os.value === OSType.Unknown ? '' : shellPathInSettings);
            expect(getStub.callCount).to.equal(os.value === OSType.Unknown ? 0 : 1);
            if (os.value !== OSType.Unknown) {
                expect(getStub.args[0][0]).to.equal(os.name.toLowerCase());
            }
        });
    });
    test('Identify shell based on user environment variables', async () => {
        const shellDetector = new UserEnvironmentShellDetector(instance(currentProcess), instance(platformService));
        shellPathsAndIdentification.forEach((shellType, shellPath) => {
            // Assume the same paths are defined in user environment variables, we should still be able to identify the shell.
            shellDetector.getDefaultPlatformShell = () => shellPath;
            expect(shellDetector.identify(telemetryProperties, {} as any)).to.equal(
                shellType,
                `Incorrect Shell Type for path '${shellPath}'`,
            );
        });
    });
    test('Default shell on Windows < 10 is cmd.exe', () => {
        const shellDetector = new UserEnvironmentShellDetector(instance(currentProcess), instance(platformService));
        when(platformService.osType).thenReturn(OSType.Windows);
        when(platformService.osRelease).thenReturn('7');
        when(currentProcess.env).thenReturn({});

        const shellPath = shellDetector.getDefaultPlatformShell();

        expect(shellPath).to.equal('cmd.exe');
    });
    test('Default shell on Windows >= 10 32bit is powershell.exe', () => {
        const shellDetector = new UserEnvironmentShellDetector(instance(currentProcess), instance(platformService));
        when(platformService.osType).thenReturn(OSType.Windows);
        when(platformService.osRelease).thenReturn('10');
        when(currentProcess.env).thenReturn({ windir: 'WindowsDir', PROCESSOR_ARCHITEW6432: '', comspec: 'hello.exe' });

        const shellPath = shellDetector.getDefaultPlatformShell();

        expect(shellPath).to.equal('WindowsDir\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe');
    });
    test('Default shell on Windows >= 10 64bit is powershell.exe', () => {
        const shellDetector = new UserEnvironmentShellDetector(instance(currentProcess), instance(platformService));
        when(platformService.osType).thenReturn(OSType.Windows);
        when(platformService.osRelease).thenReturn('10');
        when(currentProcess.env).thenReturn({ windir: 'WindowsDir', comspec: 'hello.exe' });

        const shellPath = shellDetector.getDefaultPlatformShell();

        expect(shellPath).to.equal('WindowsDir\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    });
    test('Default shell on Windows < 10 is what ever is defined in env.comspec', () => {
        const shellDetector = new UserEnvironmentShellDetector(instance(currentProcess), instance(platformService));
        when(platformService.osType).thenReturn(OSType.Windows);
        when(platformService.osRelease).thenReturn('7');
        when(currentProcess.env).thenReturn({ comspec: 'hello.exe' });

        const shellPath = shellDetector.getDefaultPlatformShell();

        expect(shellPath).to.equal('hello.exe');
    });
    [OSType.OSX, OSType.Linux].forEach((osType) => {
        test(`Default shell on ${osType} is /bin/bash`, () => {
            const shellDetector = new UserEnvironmentShellDetector(instance(currentProcess), instance(platformService));
            when(platformService.osType).thenReturn(OSType.OSX);
            when(currentProcess.env).thenReturn({});

            const shellPath = shellDetector.getDefaultPlatformShell();

            expect(shellPath).to.equal('/bin/bash');
        });
        test(`Default shell on ${osType} is what ever is in env.SHELL`, () => {
            const shellDetector = new UserEnvironmentShellDetector(instance(currentProcess), instance(platformService));
            when(platformService.osType).thenReturn(OSType.OSX);
            when(currentProcess.env).thenReturn({ SHELL: 'hello terminal.app' });

            const shellPath = shellDetector.getDefaultPlatformShell();

            expect(shellPath).to.equal('hello terminal.app');
        });
        test(`Default shell on ${osType} is what ever is /bin/bash if env.SHELL == /bin/false`, () => {
            const shellDetector = new UserEnvironmentShellDetector(instance(currentProcess), instance(platformService));
            when(platformService.osType).thenReturn(OSType.OSX);
            when(currentProcess.env).thenReturn({ SHELL: '/bin/false' });

            const shellPath = shellDetector.getDefaultPlatformShell();

            expect(shellPath).to.equal('/bin/bash');
        });
    });
});
