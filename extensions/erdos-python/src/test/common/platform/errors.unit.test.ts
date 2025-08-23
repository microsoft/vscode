// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as vscode from 'vscode';
import {
    isFileExistsError,
    isFileIsDirError,
    isFileNotFoundError,
    isNoPermissionsError,
    isNotDirError,
} from '../../../client/common/platform/errors';
import { SystemError } from './utils';

suite('FileSystem - errors', () => {
    const filename = 'spam';

    suite('isFileNotFoundError', () => {
        const tests: [Error, boolean | undefined][] = [
            [vscode.FileSystemError.FileNotFound(filename), true],
            [vscode.FileSystemError.FileExists(filename), false],
            [new SystemError('ENOENT', 'stat', '<msg>'), true],
            [new SystemError('EEXIST', '???', '<msg>'), false],
            [new Error(filename), undefined],
        ];
        tests.map(([err, expected]) => {
            test(`${err} -> ${expected}`, () => {
                const matches = isFileNotFoundError(err);

                expect(matches).to.equal(expected);
            });
        });
    });

    suite('isFileExistsError', () => {
        const tests: [Error, boolean | undefined][] = [
            [vscode.FileSystemError.FileExists(filename), true],
            [vscode.FileSystemError.FileNotFound(filename), false],
            [new SystemError('EEXIST', '???', '<msg>'), true],
            [new SystemError('ENOENT', 'stat', '<msg>'), false],
            [new Error(filename), undefined],
        ];
        tests.map(([err, expected]) => {
            test(`${err} -> ${expected}`, () => {
                const matches = isFileExistsError(err);

                expect(matches).to.equal(expected);
            });
        });
    });

    suite('isFileIsDirError', () => {
        const tests: [Error, boolean | undefined][] = [
            [vscode.FileSystemError.FileIsADirectory(filename), true],
            [vscode.FileSystemError.FileNotFound(filename), false],
            [new SystemError('EISDIR', '???', '<msg>'), true],
            [new SystemError('ENOENT', 'stat', '<msg>'), false],
            [new Error(filename), undefined],
        ];
        tests.map(([err, expected]) => {
            test(`${err} -> ${expected}`, () => {
                const matches = isFileIsDirError(err);

                expect(matches).to.equal(expected);
            });
        });
    });

    suite('isNotDirError', () => {
        const tests: [Error, boolean | undefined][] = [
            [vscode.FileSystemError.FileNotADirectory(filename), true],
            [vscode.FileSystemError.FileNotFound(filename), false],
            [new SystemError('ENOTDIR', '???', '<msg>'), true],
            [new SystemError('ENOENT', 'stat', '<msg>'), false],
            [new Error(filename), undefined],
        ];
        tests.map(([err, expected]) => {
            test(`${err} -> ${expected}`, () => {
                const matches = isNotDirError(err);

                expect(matches).to.equal(expected);
            });
        });
    });

    suite('isNoPermissionsError', () => {
        const tests: [Error, boolean | undefined][] = [
            [vscode.FileSystemError.NoPermissions(filename), true],
            [vscode.FileSystemError.FileNotFound(filename), false],
            [new SystemError('EACCES', '???', '<msg>'), true],
            [new SystemError('ENOENT', 'stat', '<msg>'), false],
            [new Error(filename), undefined],
        ];
        tests.map(([err, expected]) => {
            test(`${err} -> ${expected}`, () => {
                const matches = isNoPermissionsError(err);

                expect(matches).to.equal(expected);
            });
        });
    });
});
