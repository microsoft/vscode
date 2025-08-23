// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License

import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import * as typemoq from 'typemoq';
import { assert, use as chaiUse } from 'chai';
import { Diagnostic, TextDocument, Range, Uri, WorkspaceConfiguration, ConfigurationScope } from 'vscode';
import * as rawProcessApis from '../../../../client/common/process/rawProcessApis';
import { getInstalledPackagesDiagnostics } from '../../../../client/pythonEnvironments/creation/common/installCheckUtils';
import * as workspaceApis from '../../../../client/common/vscodeApis/workspaceApis';
import { SpawnOptions } from '../../../../client/common/process/types';
import { IInterpreterService } from '../../../../client/interpreter/contracts';
import { PythonEnvironment } from '../../../../client/pythonEnvironments/info';

chaiUse(chaiAsPromised.default);

function getSomeRequirementFile(): typemoq.IMock<TextDocument> {
    const someFilePath = 'requirements.txt';
    const someFile = typemoq.Mock.ofType<TextDocument>();
    someFile.setup((p) => p.languageId).returns(() => 'pip-requirements');
    someFile.setup((p) => p.fileName).returns(() => someFilePath);
    someFile.setup((p) => p.getText(typemoq.It.isAny())).returns(() => 'flake8-csv');
    return someFile;
}

const MISSING_PACKAGES_STR =
    '[{"line": 8, "character": 34, "endLine": 8, "endCharacter": 44, "package": "flake8-csv", "code": "not-installed", "severity": 3}]';
const MISSING_PACKAGES: Diagnostic[] = [
    {
        range: new Range(8, 34, 8, 44),
        message: 'Package `flake8-csv` is not installed in the selected environment.',
        source: 'Python-InstalledPackagesChecker',
        code: { value: 'not-installed', target: Uri.parse(`https://pypi.org/p/flake8-csv`) },
        severity: 3,
        relatedInformation: [],
    },
];

suite('Install check diagnostics tests', () => {
    let plainExecStub: sinon.SinonStub;
    let interpreterService: typemoq.IMock<IInterpreterService>;
    let getConfigurationStub: sinon.SinonStub;
    let configMock: typemoq.IMock<WorkspaceConfiguration>;

    setup(() => {
        configMock = typemoq.Mock.ofType<WorkspaceConfiguration>();
        plainExecStub = sinon.stub(rawProcessApis, 'plainExec');
        interpreterService = typemoq.Mock.ofType<IInterpreterService>();
        interpreterService
            .setup((i) => i.getActiveInterpreter(typemoq.It.isAny()))
            .returns(() => Promise.resolve(({ path: 'python' } as unknown) as PythonEnvironment));
        getConfigurationStub = sinon.stub(workspaceApis, 'getConfiguration');
        getConfigurationStub.callsFake((section?: string, _scope?: ConfigurationScope | null) => {
            if (section === 'python') {
                return configMock.object;
            }
            return undefined;
        });
    });

    teardown(() => {
        sinon.restore();
    });

    test('Test parse diagnostics', async () => {
        configMock
            .setup((c) => c.get<string>('missingPackage.severity', 'Hint'))
            .returns(() => 'Error')
            .verifiable(typemoq.Times.atLeastOnce());
        plainExecStub.resolves({ stdout: MISSING_PACKAGES_STR, stderr: '' });
        const someFile = getSomeRequirementFile();
        const result = await getInstalledPackagesDiagnostics(interpreterService.object, someFile.object);

        assert.deepStrictEqual(result, MISSING_PACKAGES);
        configMock.verifyAll();
    });

    test('Test parse empty diagnostics', async () => {
        configMock
            .setup((c) => c.get<string>('missingPackage.severity', 'Hint'))
            .returns(() => 'Error')
            .verifiable(typemoq.Times.atLeastOnce());
        plainExecStub.resolves({ stdout: '', stderr: '' });
        const someFile = getSomeRequirementFile();
        const result = await getInstalledPackagesDiagnostics(interpreterService.object, someFile.object);

        assert.deepStrictEqual(result, []);
        configMock.verifyAll();
    });

    [
        ['Error', '0'],
        ['Warning', '1'],
        ['Information', '2'],
        ['Hint', '3'],
    ].forEach((severityType: string[]) => {
        const setting = severityType[0];
        const expected = severityType[1];
        test(`Test missing package severity: ${setting}`, async () => {
            configMock
                .setup((c) => c.get<string>('missingPackage.severity', 'Hint'))
                .returns(() => setting)
                .verifiable(typemoq.Times.atLeastOnce());
            let severity: string | undefined;
            plainExecStub.callsFake((_cmd: string, _args: string[], options: SpawnOptions) => {
                severity = options.env?.VSCODE_MISSING_PGK_SEVERITY;
                return { stdout: '', stderr: '' };
            });
            const someFile = getSomeRequirementFile();
            const result = await getInstalledPackagesDiagnostics(interpreterService.object, someFile.object);

            assert.deepStrictEqual(result, []);
            assert.deepStrictEqual(severity, expected);
            configMock.verifyAll();
        });
    });
});
