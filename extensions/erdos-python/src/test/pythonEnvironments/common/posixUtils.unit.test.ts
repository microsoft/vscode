// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import { promises, Dirent } from 'fs';
import * as externalDependencies from '../../../client/pythonEnvironments/common/externalDependencies';
import { getPythonBinFromPosixPaths } from '../../../client/pythonEnvironments/common/posixUtils';

suite('Posix Utils tests', () => {
    let readDirStub: sinon.SinonStub;
    let resolveSymlinkStub: sinon.SinonStub;

    class FakeDirent extends Dirent {
        constructor(
            public readonly name: string,
            private readonly _isFile: boolean,
            private readonly _isLink: boolean,
        ) {
            super();
        }

        public isFile(): boolean {
            return this._isFile;
        }

        public isDirectory(): boolean {
            return !this._isFile && !this._isLink;
        }

        // eslint-disable-next-line class-methods-use-this
        public isBlockDevice(): boolean {
            return false;
        }

        // eslint-disable-next-line class-methods-use-this
        public isCharacterDevice(): boolean {
            return false;
        }

        public isSymbolicLink(): boolean {
            return this._isLink;
        }

        // eslint-disable-next-line class-methods-use-this
        public isFIFO(): boolean {
            return false;
        }

        // eslint-disable-next-line class-methods-use-this
        public isSocket(): boolean {
            return false;
        }
    }

    setup(() => {
        readDirStub = sinon.stub(promises, 'readdir');
        readDirStub
            .withArgs(path.join('usr', 'bin'), { withFileTypes: true })
            .resolves([
                new FakeDirent('python', false, true),
                new FakeDirent('python3', false, true),
                new FakeDirent('python3.7', false, true),
                new FakeDirent('python3.8', false, true),
            ]);
        readDirStub
            .withArgs(path.join('System', 'Library', 'Frameworks', 'Python.framework', 'Versions', '3.9', 'lib'), {
                withFileTypes: true,
            })
            .resolves([new FakeDirent('python3.9', true, false)]);

        resolveSymlinkStub = sinon.stub(externalDependencies, 'resolveSymbolicLink');
        resolveSymlinkStub
            .withArgs(path.join('usr', 'bin', 'python3.7'))
            .resolves(
                path.join('System', 'Library', 'Frameworks', 'Python.framework', 'Versions', '3.7', 'lib', 'python3.7'),
            );
        resolveSymlinkStub
            .withArgs(path.join('usr', 'bin', 'python3'))
            .resolves(
                path.join('System', 'Library', 'Frameworks', 'Python.framework', 'Versions', '3.7', 'lib', 'python3.7'),
            );
        resolveSymlinkStub
            .withArgs(path.join('usr', 'bin', 'python'))
            .resolves(
                path.join('System', 'Library', 'Frameworks', 'Python.framework', 'Versions', '3.7', 'lib', 'python3.7'),
            );
        resolveSymlinkStub
            .withArgs(path.join('usr', 'bin', 'python3.8'))
            .resolves(
                path.join('System', 'Library', 'Frameworks', 'Python.framework', 'Versions', '3.8', 'lib', 'python3.8'),
            );
        resolveSymlinkStub
            .withArgs(
                path.join('System', 'Library', 'Frameworks', 'Python.framework', 'Versions', '3.9', 'lib', 'python3.9'),
            )
            .resolves(
                path.join('System', 'Library', 'Frameworks', 'Python.framework', 'Versions', '3.9', 'lib', 'python3.9'),
            );
    });

    teardown(() => {
        readDirStub.restore();
        resolveSymlinkStub.restore();
    });
    test('getPythonBinFromPosixPaths', async () => {
        const expectedPaths = [
            path.join('usr', 'bin', 'python'),
            path.join('usr', 'bin', 'python3.8'),
            path.join('System', 'Library', 'Frameworks', 'Python.framework', 'Versions', '3.9', 'lib', 'python3.9'),
        ].sort((a, b) => a.length - b.length);

        const actualPaths = await getPythonBinFromPosixPaths([
            path.join('usr', 'bin'),
            path.join('System', 'Library', 'Frameworks', 'Python.framework', 'Versions', '3.9', 'lib'),
        ]);
        actualPaths.sort((a, b) => a.length - b.length);

        assert.deepStrictEqual(actualPaths, expectedPaths);
    });
});
