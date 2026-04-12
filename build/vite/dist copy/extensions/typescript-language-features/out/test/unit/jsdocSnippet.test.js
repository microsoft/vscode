"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
require("mocha");
const vscode = __importStar(require("vscode"));
const jsDocCompletions_1 = require("../../languageFeatures/jsDocCompletions");
const testUtils_1 = require("../testUtils");
suite('typescript.jsDocSnippet', () => {
    setup(async () => {
        // the tests assume that typescript features are registered
        await vscode.extensions.getExtension('vscode.typescript-language-features').activate();
    });
    test('Should do nothing for single line input', async () => {
        const input = `/** */`;
        assert.strictEqual((0, jsDocCompletions_1.templateToSnippet)(input).value, input);
    });
    test('Should put cursor inside multiline line input', async () => {
        assert.strictEqual((0, jsDocCompletions_1.templateToSnippet)((0, testUtils_1.joinLines)('/**', ' * ', ' */')).value, (0, testUtils_1.joinLines)('/**', ' * $0', ' */'));
    });
    test('Should add placeholders after each parameter', async () => {
        assert.strictEqual((0, jsDocCompletions_1.templateToSnippet)((0, testUtils_1.joinLines)('/**', ' * @param a', ' * @param b', ' */')).value, (0, testUtils_1.joinLines)('/**', ' * @param a ${1}', ' * @param b ${2}', ' */'));
    });
    test('Should add placeholders for types', async () => {
        assert.strictEqual((0, jsDocCompletions_1.templateToSnippet)((0, testUtils_1.joinLines)('/**', ' * @param {*} a', ' * @param {*} b', ' */')).value, (0, testUtils_1.joinLines)('/**', ' * @param {${1:*}} a ${2}', ' * @param {${3:*}} b ${4}', ' */'));
    });
    test('Should properly escape dollars in parameter names', async () => {
        assert.strictEqual((0, jsDocCompletions_1.templateToSnippet)((0, testUtils_1.joinLines)('/**', ' * ', ' * @param $arg', ' */')).value, (0, testUtils_1.joinLines)('/**', ' * $0', ' * @param \\$arg ${1}', ' */'));
    });
});
//# sourceMappingURL=jsdocSnippet.test.js.map