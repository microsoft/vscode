// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { MarkedString } from 'vscode';

export function normalizeMarkedString(content: MarkedString): string {
    return typeof content === 'string' ? content : content.value;
}

export function compareFiles(expectedContent: string, actualContent: string) {
    const expectedLines = expectedContent.split(/\r?\n/);
    const actualLines = actualContent.split(/\r?\n/);

    for (let i = 0; i < Math.min(expectedLines.length, actualLines.length); i += 1) {
        const e = expectedLines[i];
        const a = actualLines[i];
        expect(e, `Difference at line ${i}`).to.be.equal(a);
    }

    expect(
        actualLines.length,
        expectedLines.length > actualLines.length
            ? 'Actual contains more lines than expected'
            : 'Expected contains more lines than the actual',
    ).to.be.equal(expectedLines.length);
}
