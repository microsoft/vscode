// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import { convertFileType } from '../../../client/common/utils/filesystem';

class KnowsFileTypeDummyImpl {
    private _isFile: boolean;

    private _isDirectory: boolean;

    private _isSymbolicLink: boolean;

    constructor(isFile = false, isDirectory = false, isSymbolicLink = false) {
        this._isFile = isFile;
        this._isDirectory = isDirectory;
        this._isSymbolicLink = isSymbolicLink;
    }

    public isFile() {
        return this._isFile;
    }

    public isDirectory() {
        return this._isDirectory;
    }

    public isSymbolicLink() {
        return this._isSymbolicLink;
    }
}

suite('Utils for filesystem - convertFileType function', () => {
    const testsData = [
        { info: new KnowsFileTypeDummyImpl(true, false, false), kind: 'File', expected: 1 },
        { info: new KnowsFileTypeDummyImpl(false, true, false), kind: 'Directory', expected: 2 },
        { info: new KnowsFileTypeDummyImpl(false, false, true), kind: 'Symbolic Link', expected: 64 },
        { info: new KnowsFileTypeDummyImpl(false, false, false), kind: 'Unknown', expected: 0 },
    ];

    testsData.forEach((testData) => {
        test(`convertFileType when info is a ${testData.kind}`, () => {
            const fileType = convertFileType(testData.info);

            expect(fileType).equals(testData.expected);
        });
    });
});
