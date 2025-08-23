// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as sinon from 'sinon';
import * as fsapi from '../../../../../client/common/platform/fs-paths';
import { PythonReleaseLevel, PythonVersion } from '../../../../../client/pythonEnvironments/base/info';
import * as externalDeps from '../../../../../client/pythonEnvironments/common/externalDependencies';
import { getPythonVersionFromConda } from '../../../../../client/pythonEnvironments/common/environmentManagers/conda';
import { TEST_DATA_ROOT } from '../../../common/commonTestConstants';
import { assertVersionsEqual } from '../envTestUtils';

suite('Conda Python Version Parser Tests', () => {
    let readFileStub: sinon.SinonStub;
    let pathExistsStub: sinon.SinonStub;
    const testDataRoot = path.join(TEST_DATA_ROOT, 'versiondata', 'conda');

    setup(() => {
        readFileStub = sinon.stub(externalDeps, 'readFile');
        sinon.stub(externalDeps, 'inExperiment').returns(false);

        pathExistsStub = sinon.stub(externalDeps, 'pathExists');
        pathExistsStub.resolves(true);
    });

    teardown(() => {
        sinon.restore();
    });

    interface ICondaPythonVersionTestData {
        name: string;
        historyFileContents: string;
        expected: PythonVersion | undefined;
    }

    function getTestData(): ICondaPythonVersionTestData[] {
        const data: ICondaPythonVersionTestData[] = [];

        const cases = fsapi.readdirSync(testDataRoot).map((c) => path.join(testDataRoot, c));
        const casesToVersion = new Map<string, PythonVersion>();
        casesToVersion.set('case1', { major: 3, minor: 8, micro: 5 });

        casesToVersion.set('case2', {
            major: 3,
            minor: 9,
            micro: 0,
            release: { level: PythonReleaseLevel.Alpha, serial: 1 },
        });

        casesToVersion.set('case3', {
            major: 3,
            minor: 9,
            micro: 0,
            release: { level: PythonReleaseLevel.Beta, serial: 2 },
        });

        casesToVersion.set('case4', {
            major: 3,
            minor: 9,
            micro: 0,
            release: { level: PythonReleaseLevel.Candidate, serial: 1 },
        });

        casesToVersion.set('case5', {
            major: 3,
            minor: 9,
            micro: 0,
            release: { level: PythonReleaseLevel.Candidate, serial: 2 },
        });

        for (const c of cases) {
            const name = path.basename(c);
            const expected = casesToVersion.get(name);
            if (expected) {
                data.push({
                    name,
                    historyFileContents: fsapi.readFileSync(c, 'utf-8'),
                    expected,
                });
            }
        }

        return data;
    }

    const testData = getTestData();
    testData.forEach((data) => {
        test(`Parsing ${data.name}`, async () => {
            readFileStub.resolves(data.historyFileContents);

            const actual = await getPythonVersionFromConda('/path/here/does/not/matter');

            assertVersionsEqual(actual, data.expected);
        });
    });
});
