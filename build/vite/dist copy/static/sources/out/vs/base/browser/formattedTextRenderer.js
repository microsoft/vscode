/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from './dom.js';
export function renderText(text, _options, target) {
    const element = target ?? document.createElement('div');
    element.textContent = text;
    return element;
}
export function renderFormattedText(formattedText, options, target) {
    const element = target ?? document.createElement('div');
    element.textContent = '';
    _renderFormattedText(element, parseFormattedText(formattedText, !!options?.renderCodeSegments), options?.actionHandler, options?.renderCodeSegments);
    return element;
}
class StringStream {
    constructor(source) {
        this.source = source;
        this.index = 0;
    }
    eos() {
        return this.index >= this.source.length;
    }
    next() {
        const next = this.peek();
        this.advance();
        return next;
    }
    peek() {
        return this.source[this.index];
    }
    advance() {
        this.index++;
    }
}
var FormatType;
(function (FormatType) {
    FormatType[FormatType["Invalid"] = 0] = "Invalid";
    FormatType[FormatType["Root"] = 1] = "Root";
    FormatType[FormatType["Text"] = 2] = "Text";
    FormatType[FormatType["Bold"] = 3] = "Bold";
    FormatType[FormatType["Italics"] = 4] = "Italics";
    FormatType[FormatType["Action"] = 5] = "Action";
    FormatType[FormatType["ActionClose"] = 6] = "ActionClose";
    FormatType[FormatType["Code"] = 7] = "Code";
    FormatType[FormatType["NewLine"] = 8] = "NewLine";
})(FormatType || (FormatType = {}));
function _renderFormattedText(element, treeNode, actionHandler, renderCodeSegments) {
    let child;
    if (treeNode.type === 2 /* FormatType.Text */) {
        child = document.createTextNode(treeNode.content || '');
    }
    else if (treeNode.type === 3 /* FormatType.Bold */) {
        child = document.createElement('b');
    }
    else if (treeNode.type === 4 /* FormatType.Italics */) {
        child = document.createElement('i');
    }
    else if (treeNode.type === 7 /* FormatType.Code */ && renderCodeSegments) {
        child = document.createElement('code');
    }
    else if (treeNode.type === 5 /* FormatType.Action */ && actionHandler) {
        const a = document.createElement('a');
        actionHandler.disposables.add(DOM.addStandardDisposableListener(a, 'click', (event) => {
            actionHandler.callback(String(treeNode.index), event);
        }));
        child = a;
    }
    else if (treeNode.type === 8 /* FormatType.NewLine */) {
        child = document.createElement('br');
    }
    else if (treeNode.type === 1 /* FormatType.Root */) {
        child = element;
    }
    if (child && element !== child) {
        element.appendChild(child);
    }
    if (child && Array.isArray(treeNode.children)) {
        treeNode.children.forEach((nodeChild) => {
            _renderFormattedText(child, nodeChild, actionHandler, renderCodeSegments);
        });
    }
}
function parseFormattedText(content, parseCodeSegments) {
    const root = {
        type: 1 /* FormatType.Root */,
        children: []
    };
    let actionViewItemIndex = 0;
    let current = root;
    const stack = [];
    const stream = new StringStream(content);
    while (!stream.eos()) {
        let next = stream.next();
        const isEscapedFormatType = (next === '\\' && formatTagType(stream.peek(), parseCodeSegments) !== 0 /* FormatType.Invalid */);
        if (isEscapedFormatType) {
            next = stream.next(); // unread the backslash if it escapes a format tag type
        }
        if (!isEscapedFormatType && isFormatTag(next, parseCodeSegments) && next === stream.peek()) {
            stream.advance();
            if (current.type === 2 /* FormatType.Text */) {
                current = stack.pop();
            }
            const type = formatTagType(next, parseCodeSegments);
            if (current.type === type || (current.type === 5 /* FormatType.Action */ && type === 6 /* FormatType.ActionClose */)) {
                current = stack.pop();
            }
            else {
                const newCurrent = {
                    type: type,
                    children: []
                };
                if (type === 5 /* FormatType.Action */) {
                    newCurrent.index = actionViewItemIndex;
                    actionViewItemIndex++;
                }
                current.children.push(newCurrent);
                stack.push(current);
                current = newCurrent;
            }
        }
        else if (next === '\n') {
            if (current.type === 2 /* FormatType.Text */) {
                current = stack.pop();
            }
            current.children.push({
                type: 8 /* FormatType.NewLine */
            });
        }
        else {
            if (current.type !== 2 /* FormatType.Text */) {
                const textCurrent = {
                    type: 2 /* FormatType.Text */,
                    content: next
                };
                current.children.push(textCurrent);
                stack.push(current);
                current = textCurrent;
            }
            else {
                current.content += next;
            }
        }
    }
    if (current.type === 2 /* FormatType.Text */) {
        current = stack.pop();
    }
    if (stack.length) {
        // incorrectly formatted string literal
    }
    return root;
}
function isFormatTag(char, supportCodeSegments) {
    return formatTagType(char, supportCodeSegments) !== 0 /* FormatType.Invalid */;
}
function formatTagType(char, supportCodeSegments) {
    switch (char) {
        case '*':
            return 3 /* FormatType.Bold */;
        case '_':
            return 4 /* FormatType.Italics */;
        case '[':
            return 5 /* FormatType.Action */;
        case ']':
            return 6 /* FormatType.ActionClose */;
        case '`':
            return supportCodeSegments ? 7 /* FormatType.Code */ : 0 /* FormatType.Invalid */;
        default:
            return 0 /* FormatType.Invalid */;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9ybWF0dGVkVGV4dFJlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9icm93c2VyL2Zvcm1hdHRlZFRleHRSZW5kZXJlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLFVBQVUsQ0FBQztBQWVoQyxNQUFNLFVBQVUsVUFBVSxDQUFDLElBQVksRUFBRSxRQUFxQyxFQUFFLE1BQW9CO0lBQ25HLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3hELE9BQU8sQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO0lBQzNCLE9BQU8sT0FBTyxDQUFDO0FBQ2hCLENBQUM7QUFFRCxNQUFNLFVBQVUsbUJBQW1CLENBQUMsYUFBcUIsRUFBRSxPQUFvQyxFQUFFLE1BQW9CO0lBQ3BILE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3hELE9BQU8sQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO0lBQ3pCLG9CQUFvQixDQUFDLE9BQU8sRUFBRSxrQkFBa0IsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDLE9BQU8sRUFBRSxrQkFBa0IsQ0FBQyxFQUFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLGtCQUFrQixDQUFDLENBQUM7SUFDckosT0FBTyxPQUFPLENBQUM7QUFDaEIsQ0FBQztBQUVELE1BQU0sWUFBWTtJQUlqQixZQUFZLE1BQWM7UUFDekIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDaEIsQ0FBQztJQUVNLEdBQUc7UUFDVCxPQUFPLElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxD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