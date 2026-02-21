/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ICodeBlockData } from '../../../../browser/widget/chatContentParts/codeBlockPart.js';
import { ChatTreeItem } from '../../../../browser/chat.js';
import { URI } from '../../../../../../../base/common/uri.js';

suite('ChatMarkdownContentPart', () => {
    ensureNoDisposablesAreLeakedInTestSuite();

    test('ICodeBlockData accepts text field for pre-model height estimation', () => {
        const data: ICodeBlockData = {
            languageId: 'typescript',
            textModel: Promise.resolve(null!),
            codeBlockIndex: 0,
            codeBlockPartIndex: 0,
            element: {} as unknown as ChatTreeItem,
            chatSessionResource: URI.parse('test://session'),
            text: 'line1\nline2\nline3'
        };

        assert.strictEqual(data.text, 'line1\nline2\nline3');
        assert.strictEqual(data.text?.split('\n').length, 3, 'text should have 3 lines');
    });

    test('ICodeBlockData text field is optional', () => {
        const data: ICodeBlockData = {
            languageId: 'typescript',
            textModel: Promise.resolve(null!),
            codeBlockIndex: 0,
            codeBlockPartIndex: 0,
            element: {} as unknown as ChatTreeItem,
            chatSessionResource: URI.parse('test://session'),
        };

        assert.strictEqual(data.text, undefined);
    });
});
