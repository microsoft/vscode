/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createScanner } from './json.js';
export function format(documentText, range, options) {
    let initialIndentLevel;
    let formatText;
    let formatTextStart;
    let rangeStart;
    let rangeEnd;
    if (range) {
        rangeStart = range.offset;
        rangeEnd = rangeStart + range.length;
        formatTextStart = rangeStart;
        while (formatTextStart > 0 && !isEOL(documentText, formatTextStart - 1)) {
            formatTextStart--;
        }
        let endOffset = rangeEnd;
        while (endOffset < documentText.length && !isEOL(documentText, endOffset)) {
            endOffset++;
        }
        formatText = documentText.substring(formatTextStart, endOffset);
        initialIndentLevel = computeIndentLevel(formatText, options);
    }
    else {
        formatText = documentText;
        initialIndentLevel = 0;
        formatTextStart = 0;
        rangeStart = 0;
        rangeEnd = documentText.length;
    }
    const eol = getEOL(options, documentText);
    let lineBreak = false;
    let indentLevel = 0;
    let indentValue;
    if (options.insertSpaces) {
        indentValue = repeat(' ', options.tabSize || 4);
    }
    else {
        indentValue = '\t';
    }
    const scanner = createScanner(formatText, false);
    let hasError = false;
    function newLineAndIndent() {
        return eol + repeat(indentValue, initialIndentLevel + indentLevel);
    }
    function scanNext() {
        let token = scanner.scan();
        lineBreak = false;
        while (token === 15 /* SyntaxKind.Trivia */ || token === 14 /* SyntaxKind.LineBreakTrivia */) {
            lineBreak = lineBreak || (token === 14 /* SyntaxKind.LineBreakTrivia */);
            token = scanner.scan();
        }
        hasError = token === 16 /* SyntaxKind.Unknown */ || scanner.getTokenError() !== 0 /* ScanError.None */;
        return token;
    }
    const editOperations = [];
    function addEdit(text, startOffset, endOffset) {
        if (!hasError && startOffset < rangeEnd && endOffset > rangeStart && documentText.substring(startOffset, endOffset) !== text) {
            editOperations.push({ offset: startOffset, length: endOffset - startOffset, content: text });
        }
    }
    let firstToken = scanNext();
    if (firstToken !== 17 /* SyntaxKind.EOF */) {
        const firstTokenStart = scanner.getTokenOffset() + formatTextStart;
        const initialIndent = repeat(indentValue, initialIndentLevel);
        addEdit(initialIndent, formatTextStart, firstTokenStart);
    }
    while (firstToken !== 17 /* SyntaxKind.EOF */) {
        let firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + formatTextStart;
        let secondToken = scanNext();
        let replaceContent = '';
        while (!lineBreak && (secondToken === 12 /* SyntaxKind.LineCommentTrivia */ || secondToken === 13 /* SyntaxKind.BlockCommentTrivia */)) {
            // comments on the same line: keep them on the same line, but ignore them otherwise
            const commentTokenStart = scanner.getTokenOffset() + formatTextStart;
            addEdit(' ', firstTokenEnd, commentTokenStart);
            firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + formatTextStart;
            replaceContent = secondToken === 12 /* SyntaxKind.LineCommentTrivia */ ? newLineAndIndent() : '';
            secondToken = scanNext();
        }
        if (secondToken === 2 /* SyntaxKind.CloseBraceToken */) {
            if (firstToken !== 1 /* SyntaxKind.OpenBraceToken */) {
                indentLevel--;
                replaceContent = newLineAndIndent();
            }
        }
        else if (secondToken === 4 /* SyntaxKind.CloseBracketToken */) {
            if (firstToken !== 3 /* SyntaxKind.OpenBracketToken */) {
                indentLevel--;
                replaceContent = newLineAndIndent();
            }
        }
        else {
            switch (firstToken) {
                case 3 /* SyntaxKind.OpenBracketToken */:
                case 1 /* SyntaxKind.OpenBraceToken */:
                    indentLevel++;
                    replaceContent = newLineAndIndent();
                    break;
                case 5 /* SyntaxKind.CommaToken */:
                case 12 /* SyntaxKind.LineCommentTrivia */:
                    replaceContent = newLineAndIndent();
                    break;
                case 13 /* SyntaxKind.BlockCommentTrivia */:
                    if (lineBreak) {
                        replaceContent = newLineAndIndent();
                    }
                    else {
                        // symbol following comment on the same line: keep on same line, separate with ' '
                        replaceContent = ' ';
                    }
                    break;
                case 6 /* SyntaxKind.ColonToken */:
                    replaceContent = ' ';
                    break;
                case 10 /* SyntaxKind.StringLiteral */:
                    if (secondToken === 6 /* SyntaxKind.ColonToken */) {
                        replaceContent = '';
                        break;
                    }
                // fall through
                case 7 /* SyntaxKind.NullKeyword */:
                case 8 /* SyntaxKind.TrueKeyword */:
                case 9 /* SyntaxKind.FalseKeyword */:
                case 11 /* SyntaxKind.NumericLiteral */:
                case 2 /* SyntaxKind.CloseBraceToken */:
                case 4 /* SyntaxKind.CloseBracketToken */:
                    if (secondToken === 12 /* SyntaxKind.LineCommentTrivia */ || secondToken === 13 /* SyntaxKind.BlockCommentTrivia */) {
                        replaceContent = ' ';
                    }
                    else if (secondToken !== 5 /* SyntaxKind.CommaToken */ && secondToken !== 17 /* SyntaxKind.EOF */) {
                        hasError = true;
                    }
                    break;
                case 16 /* SyntaxKind.Unknown */:
                    hasError = true;
                    break;
            }
            if (lineBreak && (secondToken === 12 /* SyntaxKind.LineCommentTrivia */ || secondToken === 13 /* SyntaxKind.BlockCommentTrivia */)) {
                replaceContent = newLineAndIndent();
            }
        }
        const secondTokenStart = scanner.getTokenOffset() + formatTextStart;
        addEdit(replaceContent, firstTokenEnd, secondTokenStart);
        firstToken = secondToken;
    }
    return editOperations;
}
/**
 * Creates a formatted string out of the object passed as argument, using the given formatting options
 * @param any The object to stringify and format
 * @param options The formatting options to use
 */
export function toFormattedString(obj, options) {
    const content = JSON.stringify(obj, undefined, options.insertSpaces ? options.tabSize || 4 : '\t');
    if (options.eol !== undefined) {
        return content.replace(/\r\n|\r|\n/g, options.eol);
    }
    return content;
}
function repeat(s, count) {
    let result = '';
    for (let i = 0; i < count; i++) {
        result += s;
    }
    return result;
}
function computeIndentLevel(content, options) {
    let i = 0;
    let nChars = 0;
    const tabSize = options.tabSize || 4;
    while (i < content.length) {
        const ch = content.charAt(i);
        if (ch === ' ') {
            nChars++;
        }
        else if (ch === '\t') {
            nChars += tabSize;
        }
        else {
            break;
        }
        i++;
    }
    return Math.floor(nChars / tabSize);
}
export function getEOL(options, text) {
    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i);
        if (ch === '\r') {
            if (i + 1 < text.length && text.charAt(i + 1) === '\n') {
                return '\r\n';
            }
            return '\r';
        }
        else if (ch === '\n') {
            return '\n';
        }
    }
    return (options && options.eol) || '\n';
}
export function isEOL(text, offset) {
    return '\r\n'.indexOf(text.charAt(offset)) !== -1;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvbkZvcm1hdHRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2pzb25Gb3JtYXR0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGFBQWEsRUFBeUIsTUFBTSxXQUFXLENBQUM7QUFrRGpFLE1BQU0sVUFBVSxNQUFNLENBQUMsWUFBb0IsRUFBRSxLQUF3QixFQUFFLE9BQTBCO0lBQ2hHLElBQUksa0JBQTBCLENBQUM7SUFDL0IsSUFBSSxVQUFrQixDQUFDO0lBQ3ZCLElBQUksZUFBdUIsQ0FBQztJQUM1QixJQUFJLFVBQWtCLENBQUM7SUFDdkIsSUFBSSxRQUFnQixDQUFDO0lBQ3JCLElBQUksS0FBSyxFQUFFLENBQUM7UUFDWCxVQUFVLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUMxQixRQUFRLEdBQUcsVUFBVSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7UUFFckMsZUFBZSxHQUFHLFVBQVUsQ0FBQztRQUM3QixPQUFPLGVBQWUsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLGVBQWUsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3pFLGVBQWUsRUFBRSxDQUFDO1FBQ25CLENBQUM7UUFDRCxJQUFJLFNBQVMsR0FBRyxRQUFRLENBQUM7UUFDekIsT0FBTyxTQUFTLEdBQUcsWUFBWSxDQUFDLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUMzRSxTQUFTLEVBQUUsQ0FBQztRQUNiLENBQUM7UUFDRCxVQUFVLEdBQUcsWUFBWSxDQUFDLFNBQVMsQ0FBQyxlQUFlLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDaEUsa0JBQWtCLEdBQUcsa0JBQWtCLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lB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