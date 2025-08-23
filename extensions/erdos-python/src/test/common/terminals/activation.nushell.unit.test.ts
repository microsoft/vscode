// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as path from 'path';
import * as TypeMoq from 'typemoq';
import '../../../client/common/extensions';
import { IFileSystem } from '../../../client/common/platform/types';
import { Nushell } from '../../../client/common/terminal/environmentActivationProviders/nushell';
import { TerminalShellType } from '../../../client/common/terminal/types';
import { getNamesAndValues } from '../../../client/common/utils/enum';
import { IInterpreterService } from '../../../client/interpreter/contracts';
import { IServiceContainer } from '../../../client/ioc/types';
import { PythonEnvironment } from '../../../client/pythonEnvironments/info';

const pythonPath = 'usr/bin/python';

suite('Terminal Environment Activation (nushell)', () => {
    for (const scriptFileName of ['activate', 'activate.sh', 'activate.nu']) {
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
                serviceContainer.setup((c) => c.get(IInterpreterService)).returns(() => interpreterService.object);
            });

            for (const { name, value } of getNamesAndValues<TerminalShellType>(TerminalShellType)) {
                const isNushell = value === TerminalShellType.nushell;
                const isScriptFileSupported = isNushell && ['activate.nu'].includes(scriptFileName);
                const expectedReturn = isScriptFileSupported ? 'activation command' : 'undefined';

                // eslint-disable-next-line no-loop-func -- setup() takes care of shellType and fileSystem reinitialization
                test(`Ensure nushell Activation command returns ${expectedReturn} (Shell: ${name})`, async () => {
                    const nu = new Nushell(serviceContainer.object);

                    const supported = nu.isShellSupported(value);
                    if (isNushell) {
                        expect(supported).to.be.equal(true, `${name} shell not supported (it should be)`);
                    } else {
                        expect(supported).to.be.equal(false, `${name} incorrectly supported (should not be)`);
                        // No point proceeding with other tests.
                        return;
                    }

                    const pathToScriptFile = path.join(path.dirname(pythonPath), scriptFileName);
                    fileSystem
                        .setup((fs) => fs.fileExists(TypeMoq.It.isValue(pathToScriptFile)))
                        .returns(() => Promise.resolve(true));
                    const command = await nu.getActivationCommands(undefined, value);

                    if (isScriptFileSupported) {
                        expect(command).to.be.deep.equal(
                            [`overlay use ${pathToScriptFile.fileToCommandArgumentForPythonExt()}`.trim()],
                            'Invalid command',
                        );
                    } else {
                        expect(command).to.be.equal(undefined, 'Command should be undefined');
                    }
                });
            }
        });
    }
});
