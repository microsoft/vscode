/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { appendMarkdownString, canMergeMarkdownStrings } from '../model/chatModel.js';
export const contentRefUrl = 'http://_vscodecontentref_'; // must be lowercase for URI
export function annotateSpecialMarkdownContent(response) {
    let refIdPool = 0;
    const result = [];
    for (const item of response) {
        const previousItemIndex = result.findLastIndex(p => p.kind !== 'textEditGroup' && p.kind !== 'undoStop');
        const previousItem = result[previousItemIndex];
        if (item.kind === 'inlineReference') {
            let label = item.name;
            if (!label) {
                if (URI.isUri(item.inlineReference)) {
                    label = basename(item.inlineReference);
                }
                else if (isLocation(item.inlineReference)) {
                    label = basename(item.inlineReference.uri);
                }
                else {
                    label = item.inlineReference.name;
                }
            }
            // When the preceding markdown ends inside a code context (inline code span
            // or fenced code block), markdown links won't be parsed, they render as
            // literal text like [file](http://_vscodecontentref_/1). In that case, emit
            // just the plain label so the output stays readable.
            const previousText = previousItem?.kind === 'markdownContent' ? previousItem.content.value : '';
            if (isInsideCodeContext(previousText)) {
                if (previousItem?.kind === 'markdownContent') {
                    const merged = appendMarkdownString(previousItem.content, new MarkdownString(label));
                    result[previousItemIndex] = { ...previousItem, content: merged };
                }
                else {
                    result.push({ content: new MarkdownString(label), kind: 'markdownContent' });
                }
            }
            else {
                const refId = refIdPool++;
                const printUri = URI.parse(contentRefUrl).with({ path: String(refId) });
                const markdownText = `[${label}](${printUri.toString()})`;
                const annotationMetadata = { [refId]: item };
                if (previousItem?.kind === 'markdownContent') {
                    const merged = appendMarkdownString(previousItem.content, new MarkdownString(markdownText));
                    result[previousItemIndex] = { ...previousItem, content: merged, inlineReferences: { ...annotationMetadata, ...(previousItem.inlineReferences || {}) } };
                }
                else {
                    result.push({ content: new MarkdownString(markdownText), inlineReferences: annotationMetadata, kind: 'markdownContent' });
                }
            }
        }
        else if (item.kind === 'markdownContent' && previousItem?.kind === 'markdownContent') {
            if (canMergeMarkdownStrings(previousItem.content, item.content)) {
                const merged = appendMarkdownString(previousItem.content, item.content);
                result[previousItemIndex] = { ...previousItem, content: merged };
            }
            else if (previousItem.inlineReferences && isContentRefOnly(previousItem.content.value)) {
                // The previous item is a standalone inline reference whose MarkdownString
                // was synthesized with default properties that don't match the incoming
                // markdown (e.g., different isTrusted). Prepend the reference text and
                // adopt the incoming item's properties so they render together in one block.
                result[previousItemIndex] = {
                    ...previousItem,
                    content: {
                        ...item.content,
                        value: previousItem.content.value + item.content.value,
                    },
                };
            }
            else {
                result.push(item);
            }
        }
        else if (item.kind === 'markdownVuln') {
            const vulnText = encodeURIComponent(JSON.stringify(item.vulnerabilities));
            const markdownText = `<vscode_annotation details='${vulnText}'>${item.content.value}</vscode_annotation>`;
            if (previousItem?.kind === 'markdownContent') {
                // Since this is inside a codeblock, it needs to be merged into the previous markdown content.
                const merged = appendMarkdownString(previousItem.content, new MarkdownString(markdownText));
                result[previousItemIndex] = { ...previousItem, content: merged };
            }
            else {
                result.push({ content: new MarkdownString(markdownText), kind: 'markdownContent' });
            }
        }
        else if (item.kind === 'codeblockUri') {
            if (previousItem?.kind === 'markdownContent') {
                const isEditText = item.isEdit ? ` isEdit` : '';
                const subAgentText = item.subAgentInvocationId ? ` subAgentInvocationId="${encodeURIComponent(item.subAgentInvocationId)}"` : '';
                const markdownText = `<vscode_codeblock_uri${isEditText}${subAgentText}>${item.uri.toString()}</vscode_codeblock_uri>`;
                const merged = appendMarkdownString(previousItem.content, new MarkdownString(markdownText));
                // delete the previous and append to ensure that we don't reorder the edit before the undo stop containing it
                result.splice(previousItemIndex, 1);
                result.push({ ...previousItem, content: merged });
            }
        }
        else {
            result.push(item);
        }
    }
    return result;
}
const contentRefPattern = new RegExp(`^(\\[.*?\\]\\(${contentRefUrl}/\\d+\\))+$`);
/**
 * Returns true when the text consists entirely of synthesized content-ref
 * links (e.g. `[file.ts](http://_vscodecontentref_/0)`), with no other
 * markdown text mixed in. Used to decide whether the MarkdownString
 * properties are "synthetic defaults" that can safely be replaced.
 */
function isContentRefOnly(text) {
    return contentRefPattern.test(text);
}
/**
 * Checks whether the end of a markdown string is inside a code context
 * (fenced code block or inline code span) where markdown link syntax
 * would be rendered as literal text.
 */
export function isInsideCodeContext(text) {
    const lines = text.split('\n');
    let inFencedBlock = false;
    let fenceChar = '';
    let fenceLength = 0;
    const unfencedLines = [];
    for (const line of lines) {
        const trimmed = line.trimStart();
        if (inFencedBlock) {
            // Check for closing fence: same char, at least same length, only whitespace after
            const closeLength = countLeadingChar(trimmed, fenceChar);
            if (closeLength >= fenceLength && trimmed.substring(closeLength).trim() === '') {
                inFencedBlock = false;
                unfencedLines.length = 0;
            }
            continue;
        }
        // Check for opening fence (3+ backticks or tildes at start of line)
        const firstChar = trimmed[0];
        if (firstChar === '`' || firstChar === '~') {
            const openLength = countLeadingChar(trimmed, firstChar);
            // Backtick fences: info string must not contain backticks
            if (openLength >= 3 && (firstChar === '~' || !trimmed.substring(openLength).includes('`'))) {
                inFencedBlock = true;
                fenceChar = firstChar;
                fenceLength = openLength;
                unfencedLines.length = 0;
                continue;
            }
        }
        unfencedLines.push(line);
    }
    return inFencedBlock || hasUnclosedInlineCode(unfencedLines.join('\n'));
}
function countLeadingChar(text, char) {
    let count = 0;
    while (count < text.length && text[count] === char) {
        count++;
    }
    return count;
}
/**
 * Checks whether the text has an unclosed inline code span.
 * In CommonMark, a code span opens with a backtick sequence of length N
 * and closes with the next backtick sequence of the same length N.
 */
function hasUnclosedInlineCode(text) {
    let i = 0;
    while (i < text.length) {
        if (text[i] !== '`') {
            i++;
            continue;
        }
        const openLen = countLeadingChar(text.substring(i), '`');
        i += openLen;
        // Search for a matching closing backtick sequence of the same length
        let found = false;
        while (i < text.length) {
            if (text[i] !== '`') {
                i++;
                continue;
            }
            const closeLen = countLeadingChar(text.substring(i), '`');
            i += closeLen;
            if (closeLen === openLen) {
                found = true;
                break;
            }
        }
        if (!found) {
            return true;
        }
    }
    return false;
}
export function extractCodeblockUrisFromText(text) {
    const match = /<vscode_codeblock_uri( isEdit)?( subAgentInvocationId="([^"]*)")?>([\s\S]*?)<\/vscode_codeblock_uri>/ms.exec(text);
    if (match) {
        const [all, isEdit, , encodedSubAgentId, uriString] = match;
        if (uriString) {
            const result = URI.parse(uriString);
            const textWithoutResult = text.substring(0, match.index) + text.substring(match.index + all.length);
            let subAgentInvocationId;
            if (encodedSubAgentId) {
                try {
                    subAgentInvocationId = decodeURIComponent(encodedSubAgentId);
                }
                catch {
                    subAgentInvocationId = encodedSubAgentId;
                }
            }
            return { uri: result, textWithoutResult, isEdit: !!isEdit, subAgentInvocationId };
        }
    }
    return undefined;
}
export function extractSubAgentInvocationIdFromText(text) {
    const match = /<vscode_codeblock_uri[^>]* subAgentInvocationId="([^"]*)"/ms.exec(text);
    if (match) {
        try {
            return decodeURIComponent(match[1]);
        }
        catch {
            return match[1];
        }
    }
    return undefined;
}
export function hasCodeblockUriTag(text) {
    return text.includes('<vscode_codeblock_uri');
}
export function hasEditCodeblockUriTag(text) {
    return text.includes('<vscode_codeblock_uri isEdit');
}
export function extractVulnerabilitiesFromText(text) {
    const vulnerabilities = [];
    let newText = text;
    let match;
    while ((match = /<vscode_annotation details='(.*?)'>(.*?)<\/vscode_annotation>/ms.exec(newText)) !== null) {
        const [full, details, content] = match;
        const start = match.index;
        const textBefore = newText.substring(0, start);
        const linesBefore = textBefore.split('\n').length - 1;
        const linesInside = content.split('\n').length - 1;
        const previousNewlineIdx = textBefore.lastIndexOf('\n');
        const startColumn = start - (previousNewlineIdx + 1) + 1;
        const endPreviousNewlineIdx = (textBefore + content).lastIndexOf('\n');
        const endColumn = start + content.length - (endPreviousNewlineIdx + 1) + 1;
        try {
            const vulnDetails = JSON.parse(decodeURIComponent(details));
            vulnDetails.forEach(({ title, description }) => vulnerabilities.push({
                title, description, range: { startLineNumber: linesBefore + 1, startColumn, endLineNumber: linesBefore + linesInside + 1, endColumn }
            }));
        }
        catch (err) {
            // Something went wrong with encoding this text, just ignore it
        }
        newText = newText.substring(0, start) + content + newText.substring(start + full.length);
    }
    return { newText, vulnerabilities };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5ub3RhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi93aWRnZXQvYW5ub3RhdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBd0Usb0JBQW9CLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUc1SixNQUFNLENBQUMsTUFBTSxhQUFhLEdBQUcsMkJBQTJCLENBQUMsQ0FBQyw0QkFBNEI7QUFFdEYsTUFBTSxVQUFVLDhCQUE4QixDQUFDLFFBQWdEO0lBQzlGLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztJQUVsQixNQUFNLE1BQU0sR0FBNkMsRUFBRSxDQUFDO0lBQzVELEtBQUssTUFBTSxJQUFJLElBQUksUUFBUSxFQUFFLENBQUM7UUFDN0IsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxlQUFlLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxVQUFVLENBQUMsQ0FBQztRQUN6RyxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUMvQyxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssaUJBQWlCLEVBQUUsQ0FBQztZQUNyQyxJQUFJLEtBQUssR0FBdUIsSUFBSSxDQUFDLElBQUksQ0FBQztZQUMxQyxJQUFJLENB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