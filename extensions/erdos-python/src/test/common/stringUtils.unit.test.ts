// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import '../../client/common/extensions';
import { replaceAll } from '../../client/common/stringUtils';

suite('String Extensions', () => {
    test('String should replace all substrings with new substring', () => {
        const oldString = `foo \\ foo \\ foo`;
        const expectedString = `foo \\\\ foo \\\\ foo`;
        const oldString2 = `\\ foo \\ foo`;
        const expectedString2 = `\\\\ foo \\\\ foo`;
        const oldString3 = `\\ foo \\`;
        const expectedString3 = `\\\\ foo \\\\`;
        const oldString4 = `foo foo`;
        const expectedString4 = `foo foo`;
        expect(replaceAll(oldString, '\\', '\\\\')).to.be.equal(expectedString);
        expect(replaceAll(oldString2, '\\', '\\\\')).to.be.equal(expectedString2);
        expect(replaceAll(oldString3, '\\', '\\\\')).to.be.equal(expectedString3);
        expect(replaceAll(oldString4, '\\', '\\\\')).to.be.equal(expectedString4);
    });
});
