/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { renderFormattedText, renderText } from '../../browser/formattedTextRenderer.js';
import { DisposableStore } from '../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { $ } from '../../browser/dom.js';
suite('FormattedTextRenderer', () => {
    const store = new DisposableStore();
    setup(() => {
        store.clear();
    });
    teardown(() => {
        store.clear();
    });
    test('render simple element', () => {
        const result = renderText('testing');
        assert.strictEqual(result.nodeType, document.ELEMENT_NODE);
        assert.strictEqual(result.textContent, 'testing');
        assert.strictEqual(result.tagName, 'DIV');
    });
    test('render element with target', () => {
        const target = $('div.testClass');
        const result = renderText('testing', {}, target);
        assert.strictEqual(result.nodeType, document.ELEMENT_NODE);
        assert.strictEqual(result, target);
        assert.strictEqual(result.className, 'testClass');
    });
    test('simple formatting', () => {
        let result = renderFormattedText('**bold**');
        assert.strictEqual(result.children.length, 1);
        assert.strictEqual(result.firstChild.textContent, 'bold');
        assert.strictEqual(result.firstChild.tagName, 'B');
        assert.strictEqual(result.innerHTML, '<b>bold</b>');
        result = renderFormattedText('__italics__');
        assert.strictEqual(result.innerHTML, '<i>italics</i>');
        result = renderFormattedText('``code``');
        assert.strictEqual(result.innerHTML, '``code``');
        result = renderFormattedText('``code``', { renderCodeSegments: true });
        assert.strictEqual(result.innerHTML, '<code>code</code>');
        result = renderFormattedText('this string has **bold**, __italics__, and ``code``!!', { renderCodeSegments: true });
        assert.strictEqual(result.innerHTML, 'this string has <b>bold</b>, <i>italics</i>, and <code>code</code>!!');
    });
    test('no formatting', () => {
        const result = renderFormattedText('this is just a string');
        assert.strictEqual(result.innerHTML, 'this is just a string');
    });
    test('preserve newlines', () => {
        const result = renderFormattedText('line one\nline two');
        assert.strictEqual(result.innerHTML, 'line one<br>line two');
    });
    test('action', () => {
        let callbackCalled = false;
        const result = renderFormattedText('[[action]]', {
            actionHandler: {
                callback(content) {
                    assert.strictEqual(content, '0');
                    callbackCalled = true;
                },
                disposables: store
            }
        });
        assert.strictEqual(result.innerHTML, '<a>action</a>');
        const event = document.createEvent('MouseEvent');
        event.initEvent('click', true, true);
        result.firstChild.dispatchEvent(event);
        assert.strictEqual(callbackCalled, true);
    });
    test('fancy action', () => {
        let callbackCalled = false;
        const result = renderFormattedText('__**[[action]]**__', {
            actionHandler: {
                callback(content) {
                    assert.strictEqual(content, '0');
                    callbackCalled = true;
                },
                disposables: store
            }
        });
        assert.strictEqual(result.innerHTML, '<i><b><a>action</a></b></i>');
        const event = document.createEvent('MouseEvent');
        event.initEvent('click', true, true);
        result.firstChild.firstChild.firstChild.dispatchEvent(event);
        assert.strictEqual(callbackCalled, true);
    });
    test('fancier action', () => {
        let callbackCalled = false;
        const result = renderFormattedText('``__**[[action]]**__``', {
            renderCodeSegments: true,
            actionHandler: {
                callback(content) {
                    assert.strictEqual(content, '0');
                    callbackCalled = true;
                },
                disposables: store
            }
        });
        assert.strictEqual(result.innerHTML, '<code><i><b><a>action</a></b></i></code>');
        const event = document.createEvent('MouseEvent');
        event.initEvent('click', true, true);
        result.firstChild.firstChild.firstChild.firstChild.dispatchEvent(event);
        assert.strictEqual(callbackCalled, true);
    });
    test('escaped formatting', () => {
        const result = renderFormattedText('\\*\\*bold\\*\\*');
        assert.strictEqual(result.children.length, 0);
        assert.strictEqual(result.innerHTML, '**bold**');
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9ybWF0dGVkVGV4dFJlbmRlcmVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3QvYnJvd3Nlci9mb3JtYXR0ZWRUZXh0UmVuZGVyZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLG1CQUFtQixFQUFFLFVBQVUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM3RSxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFekMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtJQUNuQyxNQUFNLEtBQUssR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBRXBDLEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDZixDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxHQUFHLEVBQUU7UUFDYixLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDZixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLEVBQUU7UUFDbEMsTUFBTSxNQUFNLEdBQWdCLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVsRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzNELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNsRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1B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