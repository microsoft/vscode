// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { Uri } from 'vscode';

import { IProcessServiceFactory } from '../../client/common/process/types';
import { IInterpreterHelper } from '../../client/interpreter/contracts';
import { InterpreterHelper } from '../../client/interpreter/helpers';
import { TestsHelper } from '../../client/testing/common/testUtils';
import { ITestsHelper } from '../../client/testing/common/types';
import { getPythonSemVer } from '../common';
import { IocContainer } from '../serviceRegistry';

export class UnitTestIocContainer extends IocContainer {
    public async getPythonMajorVersion(resource: Uri): Promise<number> {
        const procServiceFactory = this.serviceContainer.get<IProcessServiceFactory>(IProcessServiceFactory);
        const procService = await procServiceFactory.create(resource);
        const pythonVersion = await getPythonSemVer(procService);
        if (pythonVersion) {
            return pythonVersion.major;
        }
        return -1; // log warning already issued by underlying functions...
    }

    public registerTestsHelper(): void {
        this.serviceManager.addSingleton<ITestsHelper>(ITestsHelper, TestsHelper);
    }

    public registerInterpreterStorageTypes(): void {
        this.serviceManager.add<IInterpreterHelper>(IInterpreterHelper, InterpreterHelper);
    }
}
