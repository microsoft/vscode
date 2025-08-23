// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import { isTestExecution } from '../../client/common/constants';

// Defines a Mocha test suite to group tests of similar kind together
suite('Common - Misc', () => {
    test("Ensure its identified that we're running unit tests", () => {
        expect(isTestExecution()).to.be.equal(true, 'incorrect');
    });
});
