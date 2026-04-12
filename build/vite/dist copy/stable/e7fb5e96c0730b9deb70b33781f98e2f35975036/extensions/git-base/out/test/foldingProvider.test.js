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
require("mocha");
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const foldingProvider_1 = require("../foldingProvider");
suite('GitCommitFoldingProvider', () => {
    function createMockDocument(content) {
        const lines = content.split('\n');
        return {
            lineCount: lines.length,
            lineAt: (index) => ({
                text: lines[index] || '',
                lineNumber: index
            }),
        };
    }
    const mockContext = {};
    const mockToken = { isCancellationRequested: false };
    test('empty document returns no folding ranges', () => {
        const provider = new foldingProvider_1.GitCommitFoldingProvider();
        const doc = createMockDocument('');
        const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);
        assert.strictEqual(Array.isArray(ranges) ? ranges.length : 0, 0);
    });
    test('single line document returns no folding ranges', () => {
        const provider = new foldingProvider_1.GitCommitFoldingProvider();
        const doc = createMockDocument('commit message');
        const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);
        assert.strictEqual(Array.isArray(ranges) ? ranges.length : 0, 0);
    });
    test('single comment line returns no folding ranges', () => {
        const provider = new foldingProvider_1.GitCommitFoldingProvider();
        const doc = createMockDocument('# Comment');
        const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);
        assert.strictEqual(Array.isArray(ranges) ? ranges.length : 0, 0);
    });
    test('two comment lines create one folding range', () => {
        const provider = new foldingProvider_1.GitCommitFoldingProvider();
        const content = '# Comment 1\n# Comment 2';
        const doc = createMockDocument(content);
        const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);
        assert.strictEqual(ranges.length, 1);
        assert.strictEqual(ranges[0].start, 0);
        assert.strictEqual(ranges[0].end, 1);
        assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);
    });
    test('multiple comment lines create one folding range', () => {
        const provider = new foldingProvider_1.GitCommitFoldingProvider();
        const content = '# Comment 1\n# Comment 2\n# Comment 3\n# Comment 4';
        const doc = createMockDocument(content);
        const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);
        assert.strictEqual(ranges.length, 1);
        assert.strictEqual(ranges[0].start, 0);
        assert.strictEqual(ranges[0].end, 3);
        assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);
    });
    test('comment block followed by content', () => {
        const provider = new foldingProvider_1.GitCommitFoldingProvider();
        const content = '# Comment 1\n# Comment 2\nCommit message';
        const doc = createMockDocument(content);
        const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);
        assert.strictEqual(ranges.length, 1);
        assert.strictEqual(ranges[0].start, 0);
        assert.strictEqual(ranges[0].end, 1);
        assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);
    });
    test('comment block at end of document', () => {
        const provider = new foldingProvider_1.GitCommitFoldingProvider();
        const content = 'Commit message\n\n# Comment 1\n# Comment 2';
        const doc = createMockDocument(content);
        const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);
        assert.strictEqual(ranges.length, 1);
        assert.strictEqual(ranges[0].start, 2);
        assert.strictEqual(ranges[0].end, 3);
        assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);
    });
    test('multiple separated comment blocks', () => {
        const provider = new foldingProvider_1.GitCommitFoldingProvider();
        const content = '# Comment 1\n# Comment 2\n\nCommit message\n\n# Comment 3\n# Comment 4';
        const doc = createMockDocument(content);
        const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);
        assert.strictEqual(ranges.length, 2);
        assert.strictEqual(ranges[0].start, 0);
        assert.strictEqual(ranges[0].end, 1);
        assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);
        assert.strictEqual(ranges[1].start, 5);
        assert.strictEqual(ranges[1].end, 6);
        assert.strictEqual(ranges[1].kind, vscode.FoldingRangeKind.Comment);
    });
    test('single diff line returns no folding ranges', () => {
        const provider = new foldingProvider_1.GitCommitFoldingProvider();
        const doc = createMockDocument('diff --git a/file.txt b/file.txt');
        const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);
        assert.strictEqual(Array.isArray(ranges) ? ranges.length : 0, 0);
    });
    test('diff block with content creates folding range', () => {
        const provider = new foldingProvider_1.GitCommitFoldingProvider();
        const content = 'diff --git a/file.txt b/file.txt\nindex 1234..5678\n--- a/file.txt\n+++ b/file.txt';
        const doc = createMockDocument(content);
        const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);
        assert.strictEqual(ranges.length, 1);
        assert.strictEqual(ranges[0].start, 0);
        assert.strictEqual(ranges[0].end, 3);
        assert.strictEqual(ranges[0].kind, undefined); // Diff blocks don't have a specific kind
    });
    test('multiple diff blocks', () => {
        const provider = new foldingProvider_1.GitCommitFoldingProvider();
        const content = [
            'diff --git a/file1.txt b/file1.txt',
            '--- a/file1.txt',
            '+++ b/file1.txt',
            'diff --git a/file2.txt b/file2.txt',
            '--- a/file2.txt',
            '+++ b/file2.txt'
        ].join('\n');
        const doc = createMockDocument(content);
        const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);
        assert.strictEqual(ranges.length, 2);
        assert.strictEqual(ranges[0].start, 0);
        assert.strictEqual(ranges[0].end, 2);
        assert.strictEqual(ranges[1].start, 3);
        assert.strictEqual(ranges[1].end, 5);
    });
    test('diff block at end of document', () => {
        const provider = new foldingProvider_1.GitCommitFoldingProvider();
        const content = [
            'Commit message',
            '',
            'diff --git a/file.txt b/file.txt',
            '--- a/file.txt',
            '+++ b/file.txt'
        ].join('\n');
        const doc = createMockDocument(content);
        const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);
        assert.strictEqual(ranges.length, 1);
        assert.strictEqual(ranges[0].start, 2);
        assert.strictEqual(ranges[0].end, 4);
    });
    test('realistic git commit message with comments and verbose diff', () => {
        const provider = new foldingProvider_1.GitCommitFoldingProvider();
        const content = [
            'Add folding support for git commit messages',
            '',
            '# Please enter the commit message for your changes. Lines starting',
            '# with \'#\' will be ignored, and an empty message aborts the commit.',
            '#',
            '# On branch main',
            '# Changes to be committed:',
            '#\tmodified:   extension.ts',
            '#\tnew file:   foldingProvider.ts',
            '#',
            '# ------------------------ >8 ------------------------',
            '# Do not modify or remove the line above.',
            '# Everything below it will be ignored.',
            'diff --git a/extensions/git-base/src/extension.ts b/extensions/git-base/src/extension.ts',
            'index 17ffb89..453d8f7 100644',
            '--- a/extensions/git-base/src/extension.ts',
            '+++ b/extensions/git-base/src/extension.ts',
            '@@ -3,14 +3,20 @@',
            ' *  Licensed under the MIT License.',
            '-import { ExtensionContext } from \'vscode\';',
            '+import { ExtensionContext, languages } from \'vscode\';',
            'diff --git a/extensions/git-base/src/foldingProvider.ts b/extensions/git-base/src/foldingProvider.ts',
            'new file mode 100644',
            'index 0000000..2c4a9c3',
            '--- /dev/null',
            '+++ b/extensions/git-base/src/foldingProvider.ts'
        ].join('\n');
        const doc = createMockDocument(content);
        const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);
        // Should have one comment block and two diff blocks
        assert.strictEqual(ranges.length, 3);
        // Comment block (lines 2-12)
        assert.strictEqual(ranges[0].start, 2);
        assert.strictEqual(ranges[0].end, 12);
        assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);
        // First diff block (lines 13-20)
        assert.strictEqual(ranges[1].start, 13);
        assert.strictEqual(ranges[1].end, 20);
        assert.strictEqual(ranges[1].kind, undefined);
        // Second diff block (lines 21-25)
        assert.strictEqual(ranges[2].start, 21);
        assert.strictEqual(ranges[2].end, 25);
        assert.strictEqual(ranges[2].kind, undefined);
    });
    test('mixed comment and diff content', () => {
        const provider = new foldingProvider_1.GitCommitFoldingProvider();
        const content = [
            'Fix bug in parser',
            '',
            '# Comment 1',
            '# Comment 2',
            '',
            'diff --git a/file.txt b/file.txt',
            '--- a/file.txt',
            '+++ b/file.txt',
            '',
            '# Comment 3',
            '# Comment 4'
        ].join('\n');
        const doc = createMockDocument(content);
        const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);
        assert.strictEqual(ranges.length, 3);
        // First comment block
        assert.strictEqual(ranges[0].start, 2);
        assert.strictEqual(ranges[0].end, 3);
        assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);
        // Diff block
        assert.strictEqual(ranges[1].start, 5);
        assert.strictEqual(ranges[1].end, 8);
        assert.strictEqual(ranges[1].kind, undefined);
        // Second comment block
        assert.strictEqual(ranges[2].start, 9);
        assert.strictEqual(ranges[2].end, 10);
        assert.strictEqual(ranges[2].kind, vscode.FoldingRangeKind.Comment);
    });
});
//# sourceMappingURL=foldingProvider.test.js.map