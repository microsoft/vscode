// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// eslint-disable-next-line max-classes-per-file
import * as assert from 'assert';
import * as path from 'path';
import { SemVer } from 'semver';
import * as TypeMoq from 'typemoq';
import { Uri } from 'vscode';
import { PathUtils } from '../../../client/common/platform/pathUtils';
import { IFileSystem } from '../../../client/common/platform/types';
import { Architecture } from '../../../client/common/utils/platform';
import { EnvironmentTypeComparer } from '../../../client/interpreter/configuration/environmentTypeComparer';
import { InterpreterSelector } from '../../../client/interpreter/configuration/interpreterSelector/interpreterSelector';
import { IInterpreterComparer, IInterpreterQuickPickItem } from '../../../client/interpreter/configuration/types';
import { IInterpreterHelper, IInterpreterService, WorkspacePythonPath } from '../../../client/interpreter/contracts';
import { PythonEnvType } from '../../../client/pythonEnvironments/base/info';
import { EnvironmentType, PythonEnvironment } from '../../../client/pythonEnvironments/info';
import { getOSType, OSType } from '../../common';

const info: PythonEnvironment = {
    architecture: Architecture.Unknown,
    companyDisplayName: '',
    displayName: '',
    envName: '',
    path: '',
    envType: EnvironmentType.Unknown,
    version: new SemVer('1.0.0-alpha'),
    sysPrefix: '',
    sysVersion: '',
};

class InterpreterQuickPickItem implements IInterpreterQuickPickItem {
    public path: string;

    public label: string;

    public description!: string;

    public detail?: string;

    public interpreter = ({} as unknown) as PythonEnvironment;

    constructor(l: string, p: string, d?: string) {
        this.path = p;
        this.label = l;
        this.description = d ?? p;
    }
}

suite('Interpreters - selector', () => {
    let interpreterService: TypeMoq.IMock<IInterpreterService>;
    let fileSystem: TypeMoq.IMock<IFileSystem>;
    let newComparer: TypeMoq.IMock<IInterpreterComparer>;
    class TestInterpreterSelector extends InterpreterSelector {
        public suggestionToQuickPickItem(suggestion: PythonEnvironment, workspaceUri?: Uri): IInterpreterQuickPickItem {
            return super.suggestionToQuickPickItem(suggestion, workspaceUri);
        }
    }

    let selector: TestInterpreterSelector;

    setup(() => {
        newComparer = TypeMoq.Mock.ofType<IInterpreterComparer>();
        interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
        fileSystem = TypeMoq.Mock.ofType<IFileSystem>();
        fileSystem
            .setup((x) => x.arePathsSame(TypeMoq.It.isAnyString(), TypeMoq.It.isAnyString()))
            .returns((a: string, b: string) => a === b);

        newComparer.setup((c) => c.compare(TypeMoq.It.isAny(), TypeMoq.It.isAny())).returns(() => 0);
        selector = new TestInterpreterSelector(interpreterService.object, newComparer.object, new PathUtils(false));
    });

    [true, false].forEach((isWindows) => {
        test(`Suggestions (${isWindows ? 'Windows' : 'Non-Windows'})`, async () => {
            selector = new TestInterpreterSelector(
                interpreterService.object,
                newComparer.object,
                new PathUtils(isWindows),
            );

            const initial: PythonEnvironment[] = [
                { displayName: '1', path: 'c:/path1/path1', envType: EnvironmentType.Unknown },
                { displayName: '2', path: 'c:/path1/path1', envType: EnvironmentType.Unknown },
                { displayName: '2', path: 'c:/path2/path2', envType: EnvironmentType.Unknown },
                { displayName: '2 (virtualenv)', path: 'c:/path2/path2', envType: EnvironmentType.VirtualEnv },
                { displayName: '3', path: 'c:/path2/path2', envType: EnvironmentType.Unknown },
                { displayName: '4', path: 'c:/path4/path4', envType: EnvironmentType.Conda },
                {
                    displayName: '5',
                    path: 'c:/path5/path',
                    envPath: 'c:/path5/path/to/env',
                    envType: EnvironmentType.Conda,
                },
            ].map((item) => ({ ...info, ...item }));
            interpreterService
                .setup((x) => x.getAllInterpreters(TypeMoq.It.isAny()))
                .returns(() => new Promise((resolve) => resolve(initial)));

            const actual = await selector.getAllSuggestions(undefined);

            const expected: InterpreterQuickPickItem[] = [
                new InterpreterQuickPickItem('1', 'c:/path1/path1'),
                new InterpreterQuickPickItem('2', 'c:/path1/path1'),
                new InterpreterQuickPickItem('2', 'c:/path2/path2'),
                new InterpreterQuickPickItem('2 (virtualenv)', 'c:/path2/path2'),
                new InterpreterQuickPickItem('3', 'c:/path2/path2'),
                new InterpreterQuickPickItem('4', 'c:/path4/path4'),
                new InterpreterQuickPickItem('5', 'c:/path5/path/to/env', 'c:/path5/path/to/env'),
            ];

            assert.strictEqual(actual.length, expected.length, 'Suggestion lengths are different.');
            for (let i = 0; i < expected.length; i += 1) {
                assert.strictEqual(
                    actual[i].label,
                    expected[i].label,
                    `Suggestion label is different at ${i}: expected '${expected[i].label}', found '${actual[i].label}'.`,
                );
                assert.strictEqual(
                    actual[i].path,
                    expected[i].path,
                    `Suggestion path is different at ${i}: expected '${expected[i].path}', found '${actual[i].path}'.`,
                );
                assert.strictEqual(
                    actual[i].description,
                    expected[i].description,
                    `Suggestion description is different at ${i}: expected '${expected[i].description}', found '${actual[i].description}'.`,
                );
            }
        });
    });

    test('Should sort environments with local ones first', async () => {
        const workspacePath = path.join('path', 'to', 'workspace');

        const environments: PythonEnvironment[] = [
            {
                displayName: 'one',
                envPath: path.join('path', 'to', 'another', 'workspace', '.venv'),
                path: path.join('path', 'to', 'another', 'workspace', '.venv', 'bin', 'python'),
                envType: EnvironmentType.Venv,
                type: PythonEnvType.Virtual,
            },
            {
                displayName: 'two',
                envPath: path.join(workspacePath, '.venv'),
                path: path.join(workspacePath, '.venv', 'bin', 'python'),
                envType: EnvironmentType.Venv,
                type: PythonEnvType.Virtual,
            },
            {
                displayName: 'three',
                path: path.join('a', 'global', 'env', 'python'),
                envPath: path.join('a', 'global', 'env'),
                envType: EnvironmentType.Global,
            },
            {
                displayName: 'four',
                envPath: path.join('a', 'conda', 'environment'),
                path: path.join('a', 'conda', 'environment'),
                envName: 'conda-env',
                envType: EnvironmentType.Conda,
                type: PythonEnvType.Conda,
            },
        ].map((item) => ({ ...info, ...item }));

        interpreterService
            .setup((x) => x.getAllInterpreters(TypeMoq.It.isAny()))
            .returns(() => new Promise((resolve) => resolve(environments)));

        const interpreterHelper = TypeMoq.Mock.ofType<IInterpreterHelper>();
        interpreterHelper
            .setup((i) => i.getActiveWorkspaceUri(TypeMoq.It.isAny()))
            .returns(() => ({ folderUri: { fsPath: workspacePath } } as WorkspacePythonPath));

        const environmentTypeComparer = new EnvironmentTypeComparer(interpreterHelper.object);

        selector = new TestInterpreterSelector(
            interpreterService.object,
            environmentTypeComparer,
            new PathUtils(getOSType() === OSType.Windows),
        );

        const result = await selector.getAllSuggestions(undefined);

        const expected: InterpreterQuickPickItem[] = [
            new InterpreterQuickPickItem('two', path.join(workspacePath, '.venv', 'bin', 'python')),
            new InterpreterQuickPickItem(
                'one',
                path.join('path', 'to', 'another', 'workspace', '.venv', 'bin', 'python'),
            ),
            new InterpreterQuickPickItem('four', path.join('a', 'conda', 'environment')),
            new InterpreterQuickPickItem('three', path.join('a', 'global', 'env', 'python')),
        ];

        assert.strictEqual(result.length, expected.length, 'Suggestion lengths are different.');

        for (let i = 0; i < expected.length; i += 1) {
            assert.strictEqual(
                result[i].label,
                expected[i].label,
                `Suggestion label is different at ${i}: expected '${expected[i].label}', found '${result[i].label}'.`,
            );
            assert.strictEqual(
                result[i].path,
                expected[i].path,
                `Suggestion path is different at ${i}: expected '${expected[i].path}', found '${result[i].path}'.`,
            );
        }
    });
});
