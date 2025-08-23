import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import * as platformApis from '../../../../client/common/utils/platform';
import * as externalDependencies from '../../../../client/pythonEnvironments/common/externalDependencies';
import { isPipenvEnvironmentRelatedToFolder } from '../../../../client/pythonEnvironments/common/environmentManagers/pipenv';
import { TEST_LAYOUT_ROOT } from '../commonTestConstants';

suite('Pipenv utils', () => {
    let readFile: sinon.SinonStub;
    let getEnvVar: sinon.SinonStub;
    setup(() => {
        getEnvVar = sinon.stub(platformApis, 'getEnvironmentVariable');
        readFile = sinon.stub(externalDependencies, 'readFile');
    });

    teardown(() => {
        readFile.restore();
        getEnvVar.restore();
    });

    test('Global pipenv environment is associated with a project whose Pipfile lies at 3 levels above the project', async () => {
        getEnvVar.withArgs('PIPENV_MAX_DEPTH').returns('5');
        const expectedDotProjectFile = path.join(
            TEST_LAYOUT_ROOT,
            'pipenv',
            'globalEnvironments',
            'project3-2s1eXEJ2',
            '.project',
        );
        const project = path.join(TEST_LAYOUT_ROOT, 'pipenv', 'project3');
        readFile.withArgs(expectedDotProjectFile).resolves(project);
        const interpreterPath: string = path.join(
            TEST_LAYOUT_ROOT,
            'pipenv',
            'globalEnvironments',
            'project3-2s1eXEJ2',
            'Scripts',
            'python.exe',
        );
        const folder = path.join(project, 'parent', 'child', 'folder');

        const isRelated = await isPipenvEnvironmentRelatedToFolder(interpreterPath, folder);

        assert.strictEqual(isRelated, true);
    });
});
