//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import * as myExtension from "../client/extension";

// Defines a Mocha test suite to group tests of similar kind together
suite("Blah blah", () => {

    // Defines a Mocha unit test
    test("Something Formatting 1", () => {
        assert.equal(1, [1, 2, 3].indexOf(5));
        assert.equal(-1, [1, 2, 3].indexOf(0));
    });

    // Defines a Mocha unit test
    test("Something Formatting 2", () => {
        assert.equal(1, [1, 2, 3].indexOf(5));
        assert.equal(-1, [1, 2, 3].indexOf(0));
    });
});