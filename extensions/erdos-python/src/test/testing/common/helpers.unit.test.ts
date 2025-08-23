import * as path from 'path';
import * as assert from 'assert';
import { addPathToPythonpath } from '../../../client/testing/common/helpers';

suite('Unit Tests - Test Helpers', () => {
    const newPaths = [path.join('path', 'to', 'new')];
    test('addPathToPythonpath handles undefined path', async () => {
        const launchPythonPath = undefined;
        const actualPath = addPathToPythonpath(newPaths, launchPythonPath);
        assert.equal(actualPath, path.join('path', 'to', 'new'));
    });
    test('addPathToPythonpath adds path if it does not exist in the python path', async () => {
        const launchPythonPath = path.join('random', 'existing', 'pythonpath');
        const actualPath = addPathToPythonpath(newPaths, launchPythonPath);
        const expectedPath =
            path.join('random', 'existing', 'pythonpath') + path.delimiter + path.join('path', 'to', 'new');
        assert.equal(actualPath, expectedPath);
    });
    test('addPathToPythonpath does not add to python path if the given python path already contains the path', async () => {
        const launchPythonPath = path.join('path', 'to', 'new');
        const actualPath = addPathToPythonpath(newPaths, launchPythonPath);
        const expectedPath = path.join('path', 'to', 'new');
        assert.equal(actualPath, expectedPath);
    });
    test('addPathToPythonpath correctly normalizes both existing and new paths', async () => {
        const newerPaths = [path.join('path', 'to', '/', 'new')];
        const launchPythonPath = path.join('path', 'to', '..', 'old');
        const actualPath = addPathToPythonpath(newerPaths, launchPythonPath);
        const expectedPath = path.join('path', 'old') + path.delimiter + path.join('path', 'to', 'new');
        assert.equal(actualPath, expectedPath);
    });
    test('addPathToPythonpath splits pythonpath then rejoins it', async () => {
        const launchPythonPath =
            path.join('path', 'to', 'new') +
            path.delimiter +
            path.join('path', 'to', 'old') +
            path.delimiter +
            path.join('path', 'to', 'random');
        const actualPath = addPathToPythonpath(newPaths, launchPythonPath);
        const expectedPath =
            path.join('path', 'to', 'new') +
            path.delimiter +
            path.join('path', 'to', 'old') +
            path.delimiter +
            path.join('path', 'to', 'random');
        assert.equal(actualPath, expectedPath);
    });
});
