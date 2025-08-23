// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as path from 'path';
import * as shortid from 'shortid';
import { ICurrentProcess, IPathUtils } from '../../client/common/types';
import { IEnvironmentVariablesService } from '../../client/common/variables/types';
import {
    DebugEnvironmentVariablesHelper,
    IDebugEnvironmentVariablesService,
} from '../../client/debugger/extension/configuration/resolvers/helper';
import { ConsoleType, LaunchRequestArguments } from '../../client/debugger/types';
import { isOs, OSType } from '../common';
import { closeActiveWindows, initialize, initializeTest, IS_MULTI_ROOT_TEST, TEST_DEBUGGER } from '../initialize';
import { UnitTestIocContainer } from '../testing/serviceRegistry';
import { normCase } from '../../client/common/platform/fs-paths';
import { IRecommendedEnvironmentService } from '../../client/interpreter/configuration/types';
import { RecommendedEnvironmentService } from '../../client/interpreter/configuration/recommededEnvironmentService';

use(chaiAsPromised.default);

suite('Resolving Environment Variables when Debugging', () => {
    let ioc: UnitTestIocContainer;
    let debugEnvParser: IDebugEnvironmentVariablesService;
    let pathVariableName: string;
    let mockProcess: ICurrentProcess;

    suiteSetup(async function () {
        if (!IS_MULTI_ROOT_TEST || !TEST_DEBUGGER) {
            return this.skip();
        }
        await initialize();
    });

    setup(async () => {
        await initializeDI();
        await initializeTest();
        const envParser = ioc.serviceContainer.get<IEnvironmentVariablesService>(IEnvironmentVariablesService);
        const pathUtils = ioc.serviceContainer.get<IPathUtils>(IPathUtils);
        mockProcess = ioc.serviceContainer.get<ICurrentProcess>(ICurrentProcess);
        debugEnvParser = new DebugEnvironmentVariablesHelper(envParser, mockProcess);
        pathVariableName = pathUtils.getPathVariableName();
    });
    suiteTeardown(closeActiveWindows);
    teardown(async () => {
        await ioc.dispose();
        await closeActiveWindows();
    });

    async function initializeDI() {
        ioc = new UnitTestIocContainer();
        ioc.registerProcessTypes();
        ioc.registerFileSystemTypes();
        ioc.registerVariableTypes();
        ioc.registerMockProcess();
        ioc.serviceManager.addSingleton<IRecommendedEnvironmentService>(
            IRecommendedEnvironmentService,
            RecommendedEnvironmentService,
        );
    }

    async function testBasicProperties(console: ConsoleType, expectedNumberOfVariables: number) {
        const args = ({
            program: '',
            pythonPath: '',
            args: [],
            envFile: '',
            console,
        } as any) as LaunchRequestArguments;

        const envVars = await debugEnvParser.getEnvironmentVariables(args);
        expect(envVars).not.be.undefined;
        expect(Object.keys(envVars)).lengthOf(expectedNumberOfVariables, 'Incorrect number of variables');
        expect(envVars).to.have.property('PYTHONUNBUFFERED', '1', 'Property not found');
        expect(envVars).to.have.property('PYTHONIOENCODING', 'UTF-8', 'Property not found');
    }

    test('Confirm basic environment variables exist when launched in external terminal', () =>
        testBasicProperties('externalTerminal', 2));

    test('Confirm basic environment variables exist when launched in intergrated terminal', () =>
        testBasicProperties('integratedTerminal', 2));

    test('Confirm base environment variables are merged without overwriting when provided', async () => {
        const env: Record<string, string> = { DO_NOT_OVERWRITE: '1' };
        const args = ({
            program: '',
            pythonPath: '',
            args: [],
            envFile: '',
            console,
            env,
        } as any) as LaunchRequestArguments;

        const baseEnvVars = { CONDA_PREFIX: 'path/to/conda/env', DO_NOT_OVERWRITE: '0' };
        const envVars = await debugEnvParser.getEnvironmentVariables(args, baseEnvVars);
        expect(envVars).not.be.undefined;
        expect(Object.keys(envVars)).lengthOf(4, 'Incorrect number of variables');
        expect(envVars).to.have.property('PYTHONUNBUFFERED', '1', 'Property not found');
        expect(envVars).to.have.property('PYTHONIOENCODING', 'UTF-8', 'Property not found');
        expect(envVars).to.have.property('CONDA_PREFIX', 'path/to/conda/env', 'Property not found');
        expect(envVars).to.have.property('DO_NOT_OVERWRITE', '1', 'Property not found');
    });

    test('Confirm basic environment variables exist when launched in debug console', async () => {
        let expectedNumberOfVariables = Object.keys(mockProcess.env).length;
        if (mockProcess.env['PYTHONUNBUFFERED'] === undefined) {
            expectedNumberOfVariables += 1;
        }
        if (mockProcess.env['PYTHONIOENCODING'] === undefined) {
            expectedNumberOfVariables += 1;
        }
        await testBasicProperties('internalConsole', expectedNumberOfVariables);
    });

    async function testJsonEnvVariables(console: ConsoleType, expectedNumberOfVariables: number) {
        const prop1 = normCase(shortid.generate());
        const prop2 = normCase(shortid.generate());
        const prop3 = normCase(shortid.generate());
        const env: Record<string, string> = {};
        env[prop1] = prop1;
        env[prop2] = prop2;
        mockProcess.env[prop3] = prop3;

        const args = ({
            program: '',
            pythonPath: '',
            args: [],
            envFile: '',
            console,
            env,
        } as any) as LaunchRequestArguments;

        const envVars = await debugEnvParser.getEnvironmentVariables(args);

        expect(envVars).not.be.undefined;
        expect(Object.keys(envVars)).lengthOf(expectedNumberOfVariables, 'Incorrect number of variables');
        expect(envVars).to.have.property('PYTHONUNBUFFERED', '1', 'Property not found');
        expect(envVars).to.have.property('PYTHONIOENCODING', 'UTF-8', 'Property not found');
        expect(envVars).to.have.property(prop1, prop1, 'Property not found');
        expect(envVars).to.have.property(prop2, prop2, 'Property not found');

        if (console === 'internalConsole') {
            expect(envVars).to.have.property(prop3, prop3, 'Property not found');
        } else {
            expect(envVars).not.to.have.property(prop3, prop3, 'Property not found');
        }
    }

    test('Confirm json environment variables exist when launched in external terminal', () =>
        testJsonEnvVariables('externalTerminal', 2 + 2));

    test('Confirm json environment variables exist when launched in intergrated terminal', () =>
        testJsonEnvVariables('integratedTerminal', 2 + 2));

    test('Confirm json environment variables exist when launched in debug console', async () => {
        // Add 3 for the 3 new json env variables
        let expectedNumberOfVariables = Object.keys(mockProcess.env).length + 3;
        if (mockProcess.env['PYTHONUNBUFFERED'] === undefined) {
            expectedNumberOfVariables += 1;
        }
        if (mockProcess.env['PYTHONIOENCODING'] === undefined) {
            expectedNumberOfVariables += 1;
        }
        await testJsonEnvVariables('internalConsole', expectedNumberOfVariables);
    });

    async function testAppendingOfPaths(
        console: ConsoleType,
        expectedNumberOfVariables: number,
        removePythonPath: boolean,
    ) {
        if (removePythonPath && mockProcess.env.PYTHONPATH !== undefined) {
            delete mockProcess.env.PYTHONPATH;
        }

        const customPathToAppend = shortid.generate();
        const customPythonPathToAppend = shortid.generate();
        const prop1 = shortid.generate();
        const prop2 = shortid.generate();
        const prop3 = shortid.generate();

        const env: Record<string, string> = {};
        env[pathVariableName] = customPathToAppend;
        env['PYTHONPATH'] = customPythonPathToAppend;
        env[prop1] = prop1;
        env[prop2] = prop2;
        mockProcess.env[prop3] = prop3;

        const args = ({
            program: '',
            pythonPath: '',
            args: [],
            envFile: '',
            console,
            env,
        } as any) as LaunchRequestArguments;

        const envVars = await debugEnvParser.getEnvironmentVariables(args);
        expect(envVars).not.be.undefined;
        expect(Object.keys(envVars)).lengthOf(expectedNumberOfVariables, 'Incorrect number of variables');
        expect(envVars).to.have.property('PYTHONPATH');
        expect(envVars).to.have.property(pathVariableName);
        expect(envVars).to.have.property('PYTHONUNBUFFERED', '1', 'Property not found');
        expect(envVars).to.have.property('PYTHONIOENCODING', 'UTF-8', 'Property not found');
        expect(envVars).to.have.property(prop1, prop1, 'Property not found');
        expect(envVars).to.have.property(prop2, prop2, 'Property not found');

        if (console === 'internalConsole') {
            expect(envVars).to.have.property(prop3, prop3, 'Property not found');
        } else {
            expect(envVars).not.to.have.property(prop3, prop3, 'Property not found');
        }

        // Confirm the paths have been appended correctly.
        const expectedPath = `${customPathToAppend}${path.delimiter}${mockProcess.env[pathVariableName]}`;
        expect(envVars).to.have.property(pathVariableName, expectedPath, 'PATH is not correct');

        // Confirm the paths have been appended correctly.
        let expectedPythonPath = customPythonPathToAppend;
        if (typeof mockProcess.env.PYTHONPATH === 'string' && mockProcess.env.PYTHONPATH.length > 0) {
            expectedPythonPath = customPythonPathToAppend + path.delimiter + mockProcess.env.PYTHONPATH;
        }
        expect(envVars).to.have.property('PYTHONPATH', expectedPythonPath, 'PYTHONPATH is not correct');

        if (console === 'internalConsole') {
            // All variables in current process must be in here
            expect(Object.keys(envVars).length).greaterThan(
                Object.keys(mockProcess.env).length,
                'Variables is not a subset',
            );
            Object.keys(mockProcess.env).forEach((key) => {
                if (key === pathVariableName || key === 'PYTHONPATH') {
                    return;
                }
                expect(mockProcess.env[key]).equal(
                    envVars[key],
                    `Value for the environment variable '${key}' is incorrect.`,
                );
            });
        }
    }

    test('Confirm paths get appended correctly when using json variables and launched in external terminal', async function () {
        // test is flakey on windows, path separator problems. GH issue #4758
        if (isOs(OSType.Windows)) {
            return this.skip();
        }
        await testAppendingOfPaths('externalTerminal', 6, false);
    });

    test('Confirm paths get appended correctly when using json variables and launched in integrated terminal', async function () {
        // test is flakey on windows, path separator problems. GH issue #4758
        if (isOs(OSType.Windows)) {
            return this.skip();
        }
        await testAppendingOfPaths('integratedTerminal', 6, false);
    });

    test('Confirm paths get appended correctly when using json variables and launched in debug console', async function () {
        // test is flakey on windows, path separator problems. GH issue #4758
        if (isOs(OSType.Windows)) {
            return this.skip();
        }

        // Add 3 for the 3 new json env variables
        let expectedNumberOfVariables = Object.keys(mockProcess.env).length + 3;
        if (mockProcess.env['PYTHONUNBUFFERED'] === undefined) {
            expectedNumberOfVariables += 1;
        }
        if (mockProcess.env['PYTHONPATH'] === undefined) {
            expectedNumberOfVariables += 1;
        }
        if (mockProcess.env['PYTHONIOENCODING'] === undefined) {
            expectedNumberOfVariables += 1;
        }
        await testAppendingOfPaths('internalConsole', expectedNumberOfVariables, false);
    });
});
