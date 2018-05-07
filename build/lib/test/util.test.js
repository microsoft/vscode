"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
var assert = require("assert");
var util = require("../util");
function getMockTagExists(tags) {
    return function (tag) { return tags.indexOf(tag) >= 0; };
}
suite('util tests', function () {
    test('getPreviousVersion - patch', function () {
        assert.equal(util.getPreviousVersion('1.2.3', getMockTagExists(['1.2.2', '1.2.1', '1.2.0', '1.1.0'])), '1.2.2');
    });
    test('getPreviousVersion - patch invalid', function () {
        try {
            util.getPreviousVersion('1.2.2', getMockTagExists(['1.2.0', '1.1.0']));
        }
        catch (e) {
            // expected
            return;
        }
        throw new Error('Expected an exception');
    });
    test('getPreviousVersion - minor', function () {
        assert.equal(util.getPreviousVersion('1.2.0', getMockTagExists(['1.1.0', '1.1.1', '1.1.2', '1.1.3'])), '1.1.3');
        assert.equal(util.getPreviousVersion('1.2.0', getMockTagExists(['1.1.0', '1.0.0'])), '1.1.0');
    });
    test('getPreviousVersion - minor gap', function () {
        assert.equal(util.getPreviousVersion('1.2.0', getMockTagExists(['1.1.0', '1.1.1', '1.1.3'])), '1.1.1');
    });
    test('getPreviousVersion - minor invalid', function () {
        try {
            util.getPreviousVersion('1.2.0', getMockTagExists(['1.0.0']));
        }
        catch (e) {
            // expected
            return;
        }
        throw new Error('Expected an exception');
    });
    test('getPreviousVersion - major', function () {
        assert.equal(util.getPreviousVersion('2.0.0', getMockTagExists(['1.0.0', '1.1.0', '1.2.0', '1.2.1', '1.2.2'])), '1.2.2');
    });
    test('getPreviousVersion - major invalid', function () {
        try {
            util.getPreviousVersion('3.0.0', getMockTagExists(['1.0.0']));
        }
        catch (e) {
            // expected
            return;
        }
        throw new Error('Expected an exception');
    });
});
