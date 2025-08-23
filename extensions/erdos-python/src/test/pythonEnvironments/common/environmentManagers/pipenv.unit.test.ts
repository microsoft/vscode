import * as assert from 'assert';
import * as pathModule from 'path';
import * as sinon from 'sinon';
import * as platformApis from '../../../../client/common/utils/platform';
import * as externalDependencies from '../../../../client/pythonEnvironments/common/externalDependencies';
import {
    _getAssociatedPipfile,
    isPipenvEnvironment,
    isPipenvEnvironmentRelatedToFolder,
} from '../../../../client/pythonEnvironments/common/environmentManagers/pipenv';

const path = platformApis.getOSType() === platformApis.OSType.Windows ? pathModule.win32 : pathModule.posix;

suite('Pipenv helper', () => {
    suite('isPipenvEnvironmentRelatedToFolder()', async () => {
        let readFile: sinon.SinonStub;
        let getEnvVar: sinon.SinonStub;
        let pathExists: sinon.SinonStub;
        let arePathsSame: sinon.SinonStub;
        setup(() => {
            getEnvVar = sinon.stub(platformApis, 'getEnvironmentVariable');
            readFile = sinon.stub(externalDependencies, 'readFile');
            pathExists = sinon.stub(externalDependencies, 'pathExists');
            arePathsSame = sinon.stub(externalDependencies, 'arePathsSame');
        });

        teardown(() => {
            readFile.restore();
            getEnvVar.restore();
            pathExists.restore();
            arePathsSame.restore();
        });

        test('If no Pipfile is associated with the environment, return false', async () => {
            const expectedDotProjectFile = path.join('environments', 'project-2s1eXEJ2', '.project');
            // Dot project file doesn't exist
            pathExists.withArgs(expectedDotProjectFile).resolves(false);
            const interpreterPath = path.join('environments', 'project-2s1eXEJ2', 'Scripts', 'python.exe');
            pathExists.withArgs(interpreterPath).resolves(true);
            const folder = path.join('path', 'to', 'folder');

            const isRelated = await isPipenvEnvironmentRelatedToFolder(interpreterPath, folder);

            assert.strictEqual(isRelated, false);
        });

        test('If a Pipfile is associated with the environment but no pipfile is associated with the folder, return false', async () => {
            const expectedDotProjectFile = path.join('environments', 'project-2s1eXEJ2', '.project');
            pathExists.withArgs(expectedDotProjectFile).resolves(true);
            const project = path.join('path', 'to', 'project');
            readFile.withArgs(expectedDotProjectFile).resolves(project);
            pathExists.withArgs(project).resolves(true);
            const pipFileAssociatedWithEnvironment = path.join(project, 'Pipfile');
            // Pipfile associated with environment exists
            pathExists.withArgs(pipFileAssociatedWithEnvironment).resolves(true);
            const interpreterPath = path.join('environments', 'project-2s1eXEJ2', 'Scripts', 'python.exe');
            pathExists.withArgs(interpreterPath).resolves(true);
            const folder = path.join('path', 'to', 'folder');
            const pipFileAssociatedWithFolder = path.join(folder, 'Pipfile');
            // Pipfile associated with folder doesn't exist
            pathExists.withArgs(pipFileAssociatedWithFolder).resolves(false);

            const isRelated = await isPipenvEnvironmentRelatedToFolder(interpreterPath, folder);

            assert.strictEqual(isRelated, false);
        });

        test('If a Pipfile is associated with the environment and another is associated with the folder, but the path to both Pipfiles are different, return false', async () => {
            const expectedDotProjectFile = path.join('environments', 'project-2s1eXEJ2', '.project');
            pathExists.withArgs(expectedDotProjectFile).resolves(true);
            const project = path.join('path', 'to', 'project');
            readFile.withArgs(expectedDotProjectFile).resolves(project);
            pathExists.withArgs(project).resolves(true);
            const pipFileAssociatedWithEnvironment = path.join(project, 'Pipfile');
            // Pipfile associated with environment exists
            pathExists.withArgs(pipFileAssociatedWithEnvironment).resolves(true);
            const interpreterPath = path.join('environments', 'project-2s1eXEJ2', 'Scripts', 'python.exe');
            pathExists.withArgs(interpreterPath).resolves(true);
            const folder = path.join('path', 'to', 'folder');
            const pipFileAssociatedWithFolder = path.join(folder, 'Pipfile');
            // Pipfile associated with folder exists
            pathExists.withArgs(pipFileAssociatedWithFolder).resolves(true);
            // But the paths to both Pipfiles aren't the same
            arePathsSame.withArgs(pipFileAssociatedWithEnvironment, pipFileAssociatedWithFolder).resolves(false);

            const isRelated = await isPipenvEnvironmentRelatedToFolder(interpreterPath, folder);

            assert.strictEqual(isRelated, false);
        });

        test('If a Pipfile is associated with the environment and another is associated with the folder, and the path to both Pipfiles are same, return true', async () => {
            const expectedDotProjectFile = path.join('environments', 'project-2s1eXEJ2', '.project');
            pathExists.withArgs(expectedDotProjectFile).resolves(true);
            const project = path.join('path', 'to', 'project');
            readFile.withArgs(expectedDotProjectFile).resolves(project);
            pathExists.withArgs(project).resolves(true);
            const pipFileAssociatedWithEnvironment = path.join(project, 'Pipfile');
            // Pipfile associated with environment exists
            pathExists.withArgs(pipFileAssociatedWithEnvironment).resolves(true);
            const interpreterPath = path.join('environments', 'project-2s1eXEJ2', 'Scripts', 'python.exe');
            pathExists.withArgs(interpreterPath).resolves(true);
            const folder = path.join('path', 'to', 'folder');
            const pipFileAssociatedWithFolder = path.join(folder, 'Pipfile');
            // Pipfile associated with folder exists
            pathExists.withArgs(pipFileAssociatedWithFolder).resolves(true);
            // The paths to both Pipfiles are also the same
            arePathsSame.withArgs(pipFileAssociatedWithEnvironment, pipFileAssociatedWithFolder).resolves(true);

            const isRelated = await isPipenvEnvironmentRelatedToFolder(interpreterPath, folder);

            assert.strictEqual(isRelated, true);
        });
    });

    suite('isPipenvEnvironment()', async () => {
        let readFile: sinon.SinonStub;
        let getEnvVar: sinon.SinonStub;
        let pathExists: sinon.SinonStub;
        setup(() => {
            getEnvVar = sinon.stub(platformApis, 'getEnvironmentVariable');
            readFile = sinon.stub(externalDependencies, 'readFile');
            pathExists = sinon.stub(externalDependencies, 'pathExists');
        });

        teardown(() => {
            readFile.restore();
            getEnvVar.restore();
            pathExists.restore();
        });

        test('If the project layout matches that of a local pipenv environment, return true', async () => {
            const project = path.join('path', 'to', 'project');
            pathExists.withArgs(project).resolves(true);
            const pipFile = path.join(project, 'Pipfile');
            // Pipfile associated with environment exists
            pathExists.withArgs(pipFile).resolves(true);
            // Environment is inside the project
            const interpreterPath = path.join(project, '.venv', 'Scripts', 'python.exe');

            const result = await isPipenvEnvironment(interpreterPath);

            assert.strictEqual(result, true);
        });

        test('If not local & dotProject file is missing, return false', async () => {
            const interpreterPath = path.join('environments', 'project-2s1eXEJ2', 'Scripts', 'python.exe');
            const project = path.join('path', 'to', 'project');
            pathExists.withArgs(project).resolves(true);
            const pipFile = path.join(project, 'Pipfile');
            // Pipfile associated with environment exists
            pathExists.withArgs(pipFile).resolves(true);
            const expectedDotProjectFile = path.join('environments', 'project-2s1eXEJ2', '.project');
            // dotProject file doesn't exist
            pathExists.withArgs(expectedDotProjectFile).resolves(false);

            const result = await isPipenvEnvironment(interpreterPath);

            assert.strictEqual(result, false);
        });

        test('If not local & dotProject contains invalid path to project, return false', async () => {
            const interpreterPath = path.join('environments', 'project-2s1eXEJ2', 'Scripts', 'python.exe');
            const project = path.join('path', 'to', 'project');
            // Project doesn't exist
            pathExists.withArgs(project).resolves(false);
            const expectedDotProjectFile = path.join('environments', 'project-2s1eXEJ2', '.project');
            // dotProject file doesn't exist
            pathExists.withArgs(expectedDotProjectFile).resolves(false);
            pathExists.withArgs(expectedDotProjectFile).resolves(true);
            readFile.withArgs(expectedDotProjectFile).resolves(project);

            const result = await isPipenvEnvironment(interpreterPath);

            assert.strictEqual(result, false);
        });

        test("If not local & the name of the project isn't used as a prefix in the environment folder, return false", async () => {
            const interpreterPath = path.join('environments', 'project-2s1eXEJ2', 'Scripts', 'python.exe');
            // The project name (someProjectName) isn't used as a prefix in environment folder name (project-2s1eXEJ2)
            const project = path.join('path', 'to', 'someProjectName');
            pathExists.withArgs(project).resolves(true);
            const pipFile = path.join(project, 'Pipfile');
            // Pipfile associated with environment exists
            pathExists.withArgs(pipFile).resolves(true);
            const expectedDotProjectFile = path.join('environments', 'project-2s1eXEJ2', '.project');
            pathExists.withArgs(expectedDotProjectFile).resolves(true);
            readFile.withArgs(expectedDotProjectFile).resolves(project);

            const result = await isPipenvEnvironment(interpreterPath);

            assert.strictEqual(result, false);
        });

        test('If the project layout matches that of a global pipenv environment, return true', async () => {
            const interpreterPath = path.join('environments', 'project-2s1eXEJ2', 'Scripts', 'python.exe');
            const project = path.join('path', 'to', 'project');
            pathExists.withArgs(project).resolves(true);
            const pipFile = path.join(project, 'Pipfile');
            // Pipfile associated with environment exists
            pathExists.withArgs(pipFile).resolves(true);
            const expectedDotProjectFile = path.join('environments', 'project-2s1eXEJ2', '.project');
            pathExists.withArgs(expectedDotProjectFile).resolves(true);
            readFile.withArgs(expectedDotProjectFile).resolves(project);

            const result = await isPipenvEnvironment(interpreterPath);

            assert.strictEqual(result, true);
        });
    });

    suite('_getAssociatedPipfile()', async () => {
        let getEnvVar: sinon.SinonStub;
        let pathExists: sinon.SinonStub;
        setup(() => {
            getEnvVar = sinon.stub(platformApis, 'getEnvironmentVariable');
            pathExists = sinon.stub(externalDependencies, 'pathExists');
        });

        teardown(() => {
            getEnvVar.restore();
            pathExists.restore();
        });

        test('Correct Pipfile is returned for folder whose Pipfile lies in the folder directory', async () => {
            const project = path.join('path', 'to', 'project');
            pathExists.withArgs(project).resolves(true);
            const pipFile = path.join(project, 'Pipfile');
            pathExists.withArgs(pipFile).resolves(true);
            const folder = project;

            const result = await _getAssociatedPipfile(folder, { lookIntoParentDirectories: false });

            assert.strictEqual(result, pipFile);
        });

        test('Correct Pipfile is returned for folder if a custom Pipfile name is being used', async () => {
            getEnvVar.withArgs('PIPENV_PIPFILE').returns('CustomPipfile');
            const project = path.join('path', 'to', 'project');
            pathExists.withArgs(project).resolves(true);
            const pipFile = path.join(project, 'CustomPipfile');
            pathExists.withArgs(pipFile).resolves(true);
            const folder = project;

            const result = await _getAssociatedPipfile(folder, { lookIntoParentDirectories: false });

            assert.strictEqual(result, pipFile);
        });

        test('Correct Pipfile is returned for folder whose Pipfile lies 3 levels above the folder', async () => {
            getEnvVar.withArgs('PIPENV_MAX_DEPTH').returns('5');
            const project = path.join('path', 'to', 'project');
            pathExists.withArgs(project).resolves(true);
            const pipFile = path.join(project, 'Pipfile');
            pathExists.withArgs(pipFile).resolves(true);
            const folder = path.join(project, 'parent', 'child', 'folder');
            pathExists.withArgs(folder).resolves(true);

            const result = await _getAssociatedPipfile(folder, { lookIntoParentDirectories: true });

            assert.strictEqual(result, pipFile);
        });

        test('No Pipfile is returned for folder if no Pipfile exists in the associated directories', async () => {
            getEnvVar.withArgs('PIPENV_MAX_DEPTH').returns('5');
            const project = path.join('path', 'to', 'project');
            pathExists.withArgs(project).resolves(true);
            const pipFile = path.join(project, 'Pipfile');
            // Pipfile doesn't exist
            pathExists.withArgs(pipFile).resolves(false);
            const folder = path.join(project, 'parent', 'child', 'folder');
            pathExists.withArgs(folder).resolves(true);

            const result = await _getAssociatedPipfile(folder, { lookIntoParentDirectories: true });

            assert.strictEqual(result, undefined);
        });
    });
});
