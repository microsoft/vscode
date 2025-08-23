// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import { generatePyPiLink } from '../../client/activation/requirementsTxtLinkActivator';

suite('Link to PyPi in requiements test', () => {
    [
        ['pytest', 'pytest'],
        ['pytest-cov', 'pytest-cov'],
        ['pytest_cov', 'pytest_cov'],
        ['pytest_cov[an_extra]', 'pytest_cov'],
        ['pytest == 0.6.1', 'pytest'],
        ['pytest== 0.6.1', 'pytest'],
        ['requests [security] >= 2.8.1, == 2.8.* ; python_version < "2.7"', 'requests'],
        ['# a comment', null],
        ['', null],
    ].forEach(([input, expected]) => {
        test(`PyPI link case: "${input}"`, () => {
            expect(generatePyPiLink(input!)).equal(expected ? `https://pypi.org/project/${expected}/` : null);
        });
    });
});
