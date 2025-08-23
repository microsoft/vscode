// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import { FileSystemPathUtils } from '../../../client/common/platform/fs-paths';
import { PathUtils } from '../../../client/common/platform/pathUtils';
import { WINDOWS as IS_WINDOWS } from './utils';

suite('FileSystem - PathUtils', () => {
    let utils: PathUtils;
    let wrapped: FileSystemPathUtils;
    setup(() => {
        utils = new PathUtils(IS_WINDOWS);
        wrapped = FileSystemPathUtils.withDefaults();
    });

    suite('home', () => {
        test('matches wrapped object', () => {
            const expected = wrapped.home;

            expect(utils.home).to.equal(expected);
        });
    });

    suite('delimiter', () => {
        test('matches wrapped object', () => {
            const expected = wrapped.executables.delimiter;

            expect(utils.delimiter).to.be.equal(expected);
        });
    });

    suite('separator', () => {
        test('matches wrapped object', () => {
            const expected = wrapped.paths.sep;

            expect(utils.separator).to.be.equal(expected);
        });
    });

    suite('getPathVariableName', () => {
        test('matches wrapped object', () => {
            const expected = wrapped.executables.envVar;

            const envVar = utils.getPathVariableName();

            expect(envVar).to.equal(expected);
        });
    });

    suite('getDisplayName', () => {
        test('matches wrapped object', () => {
            const filename = 'spam.py';
            const expected = wrapped.getDisplayName(filename);

            const display = utils.getDisplayName(filename);

            expect(display).to.equal(expected);
        });
    });

    suite('basename', () => {
        test('matches wrapped object', () => {
            const filename = 'spam.py';
            const expected = wrapped.paths.basename(filename);

            const basename = utils.basename(filename);

            expect(basename).to.equal(expected);
        });
    });
});
