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
const git_1 = require("../../completions/git");
suite('Git Branch Completions', () => {
    test('postProcessBranches should parse git for-each-ref output with commit details', () => {
        const input = `main|John Doe|abc1234|Fix response codeblock in debug view|2 days ago
feature/test|Jane Smith|def5678|Add new feature|1 week ago`;
        const result = git_1.gitGenerators.localBranches.postProcess(input, []);
        assert.ok(result);
        assert.strictEqual(result.length, 2);
        assert.ok(result[0]);
        assert.strictEqual(result[0].name, 'main');
        assert.strictEqual(result[0].description, '2 days ago • John Doe • abc1234 • Fix response codeblock in debug view');
        assert.strictEqual(result[0].icon, `vscode://icon?type=${vscode.TerminalCompletionItemKind.ScmBranch}`);
        assert.ok(result[1]);
        assert.strictEqual(result[1].name, 'feature/test');
        assert.strictEqual(result[1].description, '1 week ago • Jane Smith • def5678 • Add new feature');
        assert.strictEqual(result[1].icon, `vscode://icon?type=${vscode.TerminalCompletionItemKind.ScmBranch}`);
    });
    test('postProcessBranches should handle remote branches', () => {
        const input = `remotes/origin/main|John Doe|abc1234|Fix bug|2 days ago
remotes/origin/feature|Jane Smith|def5678|Add feature|1 week ago`;
        const result = git_1.gitGenerators.remoteLocalBranches.postProcess(input, []);
        assert.ok(result);
        assert.strictEqual(result.length, 2);
        assert.ok(result[0]);
        assert.strictEqual(result[0].name, 'main');
        assert.strictEqual(result[0].description, '2 days ago • John Doe • abc1234 • Fix bug');
        assert.ok(result[1]);
        assert.strictEqual(result[1].name, 'feature');
        assert.strictEqual(result[1].description, '1 week ago • Jane Smith • def5678 • Add feature');
    });
    test('postProcessBranches should filter out HEAD branches', () => {
        const input = `main|John Doe|abc1234|Fix bug|2 days ago
HEAD -> main|John Doe|abc1234|Fix bug|2 days ago`;
        const result = git_1.gitGenerators.localBranches.postProcess(input, []);
        assert.ok(result);
        assert.strictEqual(result.length, 1);
        assert.ok(result[0]);
        assert.strictEqual(result[0].name, 'main');
    });
    test('postProcessBranches should handle empty input', () => {
        const input = '';
        const result = git_1.gitGenerators.localBranches.postProcess(input, []);
        assert.ok(result);
        assert.strictEqual(result.length, 0);
    });
    test('postProcessBranches should handle git error output', () => {
        const input = 'fatal: not a git repository';
        const result = git_1.gitGenerators.localBranches.postProcess(input, []);
        assert.ok(result);
        assert.strictEqual(result.length, 0);
    });
    test('postProcessBranches should deduplicate branches', () => {
        const input = `main|John Doe|abc1234|Fix bug|2 days ago
main|John Doe|abc1234|Fix bug|2 days ago`;
        const result = git_1.gitGenerators.localBranches.postProcess(input, []);
        assert.ok(result);
        assert.strictEqual(result.length, 1);
        assert.ok(result[0]);
        assert.strictEqual(result[0].name, 'main');
    });
});
//# sourceMappingURL=git-branch.test.js.map