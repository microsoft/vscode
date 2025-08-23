// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as sinon from 'sinon';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { ApplicationEnvironment } from '../../../client/common/application/applicationEnvironment';
import { WorkspaceService } from '../../../client/common/application/workspace';
import { PlatformService } from '../../../client/common/platform/platformService';
import { IPlatformService } from '../../../client/common/platform/types';
import { ShellDetector } from '../../../client/common/terminal/shellDetector';
import { SettingsShellDetector } from '../../../client/common/terminal/shellDetectors/settingsShellDetector';
import { TerminalNameShellDetector } from '../../../client/common/terminal/shellDetectors/terminalNameShellDetector';
import { UserEnvironmentShellDetector } from '../../../client/common/terminal/shellDetectors/userEnvironmentShellDetector';
import { VSCEnvironmentShellDetector } from '../../../client/common/terminal/shellDetectors/vscEnvironmentShellDetector';
import { TerminalShellType } from '../../../client/common/terminal/types';
import { getNamesAndValues } from '../../../client/common/utils/enum';
import { OSType } from '../../../client/common/utils/platform';
import { MockProcess } from '../../../test/mocks/process';

suite('Shell Detector', () => {
    let platformService: IPlatformService;
    const defaultOSShells = {
        [OSType.Linux]: TerminalShellType.bash,
        [OSType.OSX]: TerminalShellType.bash,
        [OSType.Windows]: TerminalShellType.commandPrompt,
        [OSType.Unknown]: TerminalShellType.other,
    };
    const sandbox = sinon.createSandbox();
    setup(() => (platformService = mock(PlatformService)));
    teardown(() => sandbox.restore());

    getNamesAndValues<OSType>(OSType).forEach((os) => {
        const testSuffix = `(OS ${os.name})`;
        test(`Test identification of Terminal Shells in order of priority ${testSuffix}`, async () => {
            const callOrder: string[] = [];
            const nameDetectorIdentify = sandbox.stub(TerminalNameShellDetector.prototype, 'identify');
            nameDetectorIdentify.callsFake(() => {
                callOrder.push('calledFirst');
                return undefined;
            });
            const vscEnvDetectorIdentify = sandbox.stub(VSCEnvironmentShellDetector.prototype, 'identify');
            vscEnvDetectorIdentify.callsFake(() => {
                callOrder.push('calledSecond');
                return undefined;
            });
            const userEnvDetectorIdentify = sandbox.stub(UserEnvironmentShellDetector.prototype, 'identify');
            userEnvDetectorIdentify.callsFake(() => {
                callOrder.push('calledLast');
                return undefined;
            });
            const settingsDetectorIdentify = sandbox.stub(SettingsShellDetector.prototype, 'identify');
            settingsDetectorIdentify.callsFake(() => {
                callOrder.push('calledThird');
                return undefined;
            });

            when(platformService.osType).thenReturn(os.value);
            const nameDetector = new TerminalNameShellDetector();
            const vscEnvDetector = new VSCEnvironmentShellDetector(instance(mock(ApplicationEnvironment)));
            const userEnvDetector = new UserEnvironmentShellDetector(mock(MockProcess), instance(platformService));
            const settingsDetector = new SettingsShellDetector(
                instance(mock(WorkspaceService)),
                instance(platformService),
            );
            const detectors = [settingsDetector, userEnvDetector, nameDetector, vscEnvDetector];
            const shellDetector = new ShellDetector(instance(platformService), detectors);

            shellDetector.identifyTerminalShell();

            expect(callOrder).to.deep.equal(['calledFirst', 'calledSecond', 'calledThird', 'calledLast']);
        });
        test(`Use default shell based on OS if there are no shell detectors ${testSuffix}`, () => {
            when(platformService.osType).thenReturn(os.value);
            when(platformService.osType).thenReturn(os.value);
            const shellDetector = new ShellDetector(instance(platformService), []);

            const shell = shellDetector.identifyTerminalShell();

            expect(shell).to.be.equal(defaultOSShells[os.value]);
        });
        test(`Use default shell based on OS if there are no shell detectors (when a terminal is provided) ${testSuffix}`, () => {
            when(platformService.osType).thenReturn(os.value);
            const shellDetector = new ShellDetector(instance(platformService), []);

            const shell = shellDetector.identifyTerminalShell({ name: 'bash' } as any);

            expect(shell).to.be.equal(defaultOSShells[os.value]);
        });
        test(`Use shell provided by detector ${testSuffix}`, () => {
            when(platformService.osType).thenReturn(os.value);
            const detector = mock(UserEnvironmentShellDetector);
            const detectedShell = TerminalShellType.xonsh;
            when(detector.identify(anything(), anything())).thenReturn(detectedShell);
            const shellDetector = new ShellDetector(instance(platformService), [instance(detector)]);

            const shell = shellDetector.identifyTerminalShell();

            expect(shell).to.be.equal(detectedShell);
            verify(detector.identify(anything(), undefined)).once();
        });
        test(`Use shell provided by detector (when a terminal is provided) ${testSuffix}`, () => {
            when(platformService.osType).thenReturn(os.value);
            const terminal = { name: 'bash' } as any;
            const detector = mock(UserEnvironmentShellDetector);
            const detectedShell = TerminalShellType.xonsh;
            when(detector.identify(anything(), anything())).thenReturn(detectedShell);
            const shellDetector = new ShellDetector(instance(platformService), [instance(detector)]);

            const shell = shellDetector.identifyTerminalShell(terminal);

            expect(shell).to.be.equal(detectedShell);
            verify(detector.identify(anything(), terminal)).once();
        });
        test(`Use shell provided by detector with highest priority ${testSuffix}`, () => {
            when(platformService.osType).thenReturn(os.value);
            const detector1 = mock(UserEnvironmentShellDetector);
            const detector2 = mock(UserEnvironmentShellDetector);
            const detector3 = mock(UserEnvironmentShellDetector);
            const detectedShell = TerminalShellType.xonsh;
            when(detector1.priority).thenReturn(0);
            when(detector2.priority).thenReturn(2);
            when(detector3.priority).thenReturn(1);
            when(detector1.identify(anything(), anything())).thenReturn(TerminalShellType.tcshell);
            when(detector2.identify(anything(), anything())).thenReturn(detectedShell);
            when(detector3.identify(anything(), anything())).thenReturn(TerminalShellType.fish);
            const shellDetector = new ShellDetector(instance(platformService), [
                instance(detector1),
                instance(detector2),
                instance(detector3),
            ]);

            const shell = shellDetector.identifyTerminalShell();

            expect(shell).to.be.equal(detectedShell);
            verify(detector1.identify(anything(), anything())).never();
            verify(detector2.identify(anything(), undefined)).once();
            verify(detector3.identify(anything(), anything())).never();
        });
        test(`Fall back to detectors that can identify a shell ${testSuffix}`, () => {
            when(platformService.osType).thenReturn(os.value);
            const detector1 = mock(UserEnvironmentShellDetector);
            const detector2 = mock(UserEnvironmentShellDetector);
            const detector3 = mock(UserEnvironmentShellDetector);
            const detector4 = mock(UserEnvironmentShellDetector);
            const detectedShell = TerminalShellType.xonsh;
            when(detector1.priority).thenReturn(1);
            when(detector2.priority).thenReturn(2);
            when(detector3.priority).thenReturn(3);
            when(detector4.priority).thenReturn(4);
            when(detector1.identify(anything(), anything())).thenReturn(TerminalShellType.ksh);
            when(detector2.identify(anything(), anything())).thenReturn(detectedShell);
            when(detector3.identify(anything(), anything())).thenReturn(undefined);
            when(detector4.identify(anything(), anything())).thenReturn(undefined);
            const shellDetector = new ShellDetector(instance(platformService), [
                instance(detector1),
                instance(detector2),
                instance(detector3),
                instance(detector4),
            ]);

            const shell = shellDetector.identifyTerminalShell();

            expect(shell).to.be.equal(detectedShell);
            verify(detector1.identify(anything(), anything())).never();
            verify(detector2.identify(anything(), undefined)).once();
            verify(detector3.identify(anything(), anything())).once();
            verify(detector4.identify(anything(), anything())).once();
        });
        test(`Fall back to detectors that can identify a shell ${testSuffix} (even if detected shell is other)`, () => {
            when(platformService.osType).thenReturn(os.value);
            const detector1 = mock(UserEnvironmentShellDetector);
            const detector2 = mock(UserEnvironmentShellDetector);
            const detector3 = mock(UserEnvironmentShellDetector);
            const detector4 = mock(UserEnvironmentShellDetector);
            const detectedShell = TerminalShellType.xonsh;
            when(detector1.priority).thenReturn(1);
            when(detector2.priority).thenReturn(2);
            when(detector3.priority).thenReturn(3);
            when(detector4.priority).thenReturn(4);
            when(detector1.identify(anything(), anything())).thenReturn(TerminalShellType.ksh);
            when(detector2.identify(anything(), anything())).thenReturn(detectedShell);
            when(detector3.identify(anything(), anything())).thenReturn(TerminalShellType.other);
            when(detector4.identify(anything(), anything())).thenReturn(TerminalShellType.other);
            const shellDetector = new ShellDetector(instance(platformService), [
                instance(detector1),
                instance(detector2),
                instance(detector3),
                instance(detector4),
            ]);

            const shell = shellDetector.identifyTerminalShell();

            expect(shell).to.be.equal(detectedShell);
            verify(detector1.identify(anything(), anything())).never();
            verify(detector2.identify(anything(), undefined)).once();
            verify(detector3.identify(anything(), anything())).once();
            verify(detector4.identify(anything(), anything())).once();
        });
    });
});
