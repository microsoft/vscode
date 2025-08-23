// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as TypeMoq from 'typemoq';
import { TemporaryFileSystem } from '../../../client/common/platform/fs-temp';

interface IDeps {
    // tmp module
    fileSync(config: {
        postfix?: string;
        mode?: number;
    }): {
        name: string;
        fd: number;
        removeCallback(): void;
    };
}

suite('FileSystem - temp files', () => {
    let deps: TypeMoq.IMock<IDeps>;
    let temp: TemporaryFileSystem;
    setup(() => {
        deps = TypeMoq.Mock.ofType<IDeps>(undefined, TypeMoq.MockBehavior.Strict);
        temp = new TemporaryFileSystem(deps.object);
    });
    function verifyAll() {
        deps.verifyAll();
    }

    suite('createFile', () => {
        test(`fails if the raw call fails`, async () => {
            const failure = new Error('oops');
            deps.setup((d) => d.fileSync({ postfix: '.tmp', mode: undefined }))
                // fail with an arbitrary error
                .throws(failure);

            const promise = temp.createFile('.tmp');

            await expect(promise).to.eventually.be.rejected;
            verifyAll();
        });

        test(`fails if the raw call "returns" an error`, async () => {
            const failure = new Error('oops');
            deps.setup((d) => d.fileSync({ postfix: '.tmp', mode: undefined })).callback((_cfg, cb) =>
                cb(failure, '...', -1, () => {}),
            );

            const promise = temp.createFile('.tmp');

            await expect(promise).to.eventually.be.rejected;
            verifyAll();
        });
    });
});
