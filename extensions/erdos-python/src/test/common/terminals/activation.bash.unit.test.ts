// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as path from 'path';
import * as TypeMoq from 'typemoq';
import '../../../client/common/extensions';
import { IFileSystem } from '../../../client/common/platform/types';
import { Bash } from '../../../client/common/terminal/environmentActivationProviders/bash';
import { TerminalShellType } from '../../../client/common/terminal/types';
import { getNamesAndValues } from '../../../client/common/utils/enum';
import { IInterpreterService } from '../../../client/interpreter/contracts';
import { IServiceContainer } from '../../../client/ioc/types';
import { PythonEnvironment } from '../../../client/pythonEnvironments/info';

suite('Terminal Environment Activation (bash)', () => {
    [
        'usr/bin/python',
        'usr/bin/env with spaces/env more/python',
        'c:\\users\\windows paths\\conda\\python.exe',
    ].forEach((pythonPath) => {
        const hasSpaces = pythonPath.indexOf(' ') > 0;
        const suiteTitle = hasSpaces
            ? 'and there are spaces in the script file (pythonpath),'
            : 'and there are no spaces in the script file (pythonpath),';
        suite(suiteTitle, () => {
            [
                'activate',
                'activate.sh',
                'activate.csh',
                'activate.fish',
                'activate.bat',
                'activate.nu',
                'Activate.ps1',
            ].forEach((scriptFileName) => {
                suite(`and script file is ${scriptFileName}`, () => {
                    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
                    let interpreterService: TypeMoq.IMock<IInterpreterService>;
                    let fileSystem: TypeMoq.IMock<IFileSystem>;
                    setup(() => {
                        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
                        fileSystem = TypeMoq.Mock.ofType<IFileSystem>();
                        serviceContainer.setup((c) => c.get(IFileSystem)).returns(() => fileSystem.object);

                        interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
                        interpreterService
                            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
                            .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
                        serviceContainer
                            .setup((c) => c.get(IInterpreterService))
                            .returns(() => interpreterService.object);
                    });

                    getNamesAndValues<TerminalShellType>(TerminalShellType).forEach((shellType) => {
                        let isScriptFileSupported = false;
                        switch (shellType.value) {
                            case TerminalShellType.zsh:
                            case TerminalShellType.ksh:
                            case TerminalShellType.wsl:
                            case TerminalShellType.gitbash:
                            case TerminalShellType.bash: {
                                isScriptFileSupported = ['activate', 'activate.sh'].indexOf(scriptFileName) >= 0;
                                break;
                            }
                            case TerminalShellType.fish: {
                                isScriptFileSupported = ['activate.fish'].indexOf(scriptFileName) >= 0;
                                break;
                            }
                            case TerminalShellType.tcshell:
                            case TerminalShellType.cshell: {
                                isScriptFileSupported = ['activate.csh'].indexOf(scriptFileName) >= 0;
                                break;
                            }
                            default: {
                                isScriptFileSupported = false;
                            }
                        }
                        const titleTitle = isScriptFileSupported
                            ? `Ensure bash Activation command returns activation command (Shell: ${shellType.name})`
                            : `Ensure bash Activation command returns undefined (Shell: ${shellType.name})`;

                        test(titleTitle, async () => {
                            const bash = new Bash(serviceContainer.object);

                            const supported = bash.isShellSupported(shellType.value);
                            switch (shellType.value) {
                                case TerminalShellType.wsl:
                                case TerminalShellType.zsh:
                                case TerminalShellType.ksh:
                                case TerminalShellType.bash:
                                case TerminalShellType.gitbash:
                                case TerminalShellType.tcshell:
                                case TerminalShellType.cshell:
                                case TerminalShellType.fish: {
                                    expect(supported).to.be.equal(
                                        true,
                                        `${shellType.name} shell not supported (it should be)`,
                                    );
                                    break;
                                }
                                default: {
                                    expect(supported).to.be.equal(
                                        false,
                                        `${shellType.name} incorrectly supported (should not be)`,
                                    );
                                    // No point proceeding with other tests.
                                    return;
                                }
                            }

                            const pathToScriptFile = path.join(path.dirname(pythonPath), scriptFileName);
                            fileSystem
                                .setup((fs) => fs.fileExists(TypeMoq.It.isValue(pathToScriptFile)))
                                .returns(() => Promise.resolve(true));
                            const command = await bash.getActivationCommands(undefined, shellType.value);

                            if (isScriptFileSupported) {
                                // Ensure the script file is of the following form:
                                // source "<path to script file>" <environment name>
                                // Ensure the path is quoted if it contains any spaces.
                                // Ensure it contains the name of the environment as an argument to the script file.

                                expect(command).to.be.deep.equal(
                                    [`source ${pathToScriptFile.fileToCommandArgumentForPythonExt()}`.trim()],
                                    'Invalid command',
                                );
                            } else {
                                expect(command).to.be.equal(undefined, 'Command should be undefined');
                            }
                        });
                    });
                });
            });
        });
    });
});
