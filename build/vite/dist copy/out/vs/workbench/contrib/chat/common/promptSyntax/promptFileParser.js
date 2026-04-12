/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Iterable } from '../../../../../base/common/iterator.js';
import { dirname, joinPath } from '../../../../../base/common/resources.js';
import { splitLinesIncludeSeparators } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { parse } from '../../../../../base/common/yaml.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { PositionOffsetTransformer } from '../../../../../editor/common/core/text/positionToOffsetImpl.js';
export class PromptFileParser {
    constructor() {
    }
    parse(uri, content) {
        const linesWithEOL = splitLinesIncludeSeparators(content);
        if (linesWithEOL.length === 0) {
            return new ParsedPromptFile(uri, undefined, undefined);
        }
        let header = undefined;
        let body = undefined;
        let bodyStartLine = 0;
        if (linesWithEOL[0].match(/^---[\s\r\n]*$/)) {
            let headerEndLine = linesWithEOL.findIndex((line, index) => index > 0 && line.match(/^---[\s\r\n]*$/));
            if (headerEndLine === -1) {
                headerEndLine = linesWithEOL.length;
                bodyStartLine = linesWithEOL.length;
            }
            else {
                bodyStartLine = headerEndLine + 1;
            }
            // range starts on the line after the ---, and ends at the beginning of the line that has the closing ---
            const range = new Range(2, 1, headerEndLine + 1, 1);
            header = new PromptHeader(range, uri, linesWithEOL);
        }
        if (bodyStartLine < linesWithEOL.length) {
            // range starts  on the line after the ---, and ends at the beginning of line after the last line
            const range = new Range(bodyStartLine + 1, 1, linesWithEOL.length + 1, 1);
            body = new PromptBody(range, linesWithEOL, uri);
        }
        return new ParsedPromptFile(uri, header, body);
    }
}
export class ParsedPromptFile {
    constructor(uri, header, body) {
        this.uri = uri;
        this.header = header;
        this.body = body;
    }
}
export var PromptHeaderAttributes;
(function (PromptHeaderAttributes) {
    PromptHeaderAttributes.name = 'name';
    PromptHeaderAttributes.description = 'description';
    PromptHeaderAttributes.agent = 'agent';
    PromptHeaderAttributes.mode = 'mode';
    PromptHeaderAttributes.model = 'model';
    PromptHeaderAttributes.applyTo = 'applyTo';
    PromptHeaderAttributes.paths = 'paths';
    PromptHeaderAttributes.tools = 'tools';
    PromptHeaderAttributes.handOffs = 'handoffs';
    PromptHeaderAttributes.advancedOptions = 'advancedOptions';
    PromptHeaderAttributes.argumentHint = 'argument-hint';
    PromptHeaderAttributes.excludeAgent = 'excludeAgent';
    PromptHeaderAttributes.target = 'target';
    PromptHeaderAttributes.infer = 'infer';
    PromptHeaderAttributes.license = 'license';
    PromptHeaderAttributes.compatibility = 'compatibility';
    PromptHeaderAttributes.metadata = 'metadata';
    PromptHeaderAttributes.agents = 'agents';
    PromptHeaderAttributes.userInvocable = 'user-invocable';
    PromptHeaderAttributes.disableModelInvocation = 'disable-model-invocation';
    PromptHeaderAttributes.hooks = 'hooks';
})(PromptHeaderAttributes || (PromptHeaderAttributes = {}));
export class PromptHeader {
    constructor(range, uri, linesWithEOL) {
        this.range = range;
        this.uri = uri;
        this.linesWithEOL = linesWithEOL;
    }
    get _parsedHeader() {
        if (this._parsed === undefined) {
            const yamlErrors = [];
            const headerContent = this.linesWithEOL.slice(this.range.startLineNumber - 1, this.range.endLineNumber - 1).join('');
            const node = parse(headerContent, yamlErrors);
            const transformer = new PositionOffsetTransformer(headerContent);
            const asRange = ({ startOffset, endOffset }) => {
                const startPos = transformer.getPosition(startOffset), endPos = transformer.getPosition(endOffset);
                const headerDelta = this.range.startLineNumber - 1;
                return new Range(startPos.lineNumber + headerDelta, startPos.column, endPos.lineNumber + headerDelta, endPos.column);
            };
            const asValue = (node) => {
                switch (node.type) {
                    case 'scalar':
                        return { type: 'scalar', value: node.value, range: asRange(node), format: node.format };
                    case 'sequence':
                        return { type: 'sequence', items: node.items.map(item => asValue(item)), range: asRange(node) };
                    case 'map': {
                        const properties = node.properties.map(property => ({ key: asValue(property.key), value: asValue(property.value) }));
                        return { type: 'map', properties, range: asRange(node) };
                    }
                }
            };
            const attributes = [];
            const errors = yamlErrors.map(err => ({ message: err.message, range: asRange(err), code: err.code }));
            if (node) {
                if (node.type !== 'map') {
                    errors.push({ message: 'Invalid header, expecting <key: value> pairs', range: this.range, code: 'INVALID_YAML' });
                }
                else {
                    for (const property of node.properties) {
                        attributes.push({
                            key: property.key.value,
                            range: asRange({ startOffset: property.key.startOffset, endOffset: property.value.endOffset }),
                            value: asValue(property.value)
                        });
                    }
                }
            }
            this._parsed = { node, attributes, errors };
        }
        return this._parsed;
    }
    get attributes() {
        return this._parsedHeader.attributes;
    }
    getAttribute(key) {
        return this._parsedHeader.attributes.find(attr => attr.key === key);
    }
    get errors() {
        return this._parsedHeader.errors;
    }
    getStringAttribute(key) {
        const attribute = this._parsedHeader.attributes.find(attr => attr.key === key);
        if (attribute?.value.type === 'scalar') {
            return attribute.value.value;
        }
        return undefined;
    }
    get name() {
        return this.getStringAttribute(PromptHeaderAttributes.name);
    }
    get description() {
        return this.getStringAttribute(PromptHeaderAttributes.description);
    }
    get agent() {
        return this.getStringAttribute(PromptHeaderAttributes.agent) ?? this.getStringAttribute(PromptHeaderAttributes.mode);
    }
    get model() {
        return this.getStringOrStringArrayAttribute(PromptHeaderAttributes.model);
    }
    get applyTo() {
        return this.getStringAttribute(PromptHeaderAttributes.applyTo);
    }
    /**
     * Gets the 'paths' attribute from the header.
     * The `paths` field supports a list of glob patterns that scope the instruction
     * to specific files (used by Claude rules). Returns a string array or undefined.
     */
    get paths() {
        return this.getStringOrStringArrayAttribute(PromptHeaderAttributes.paths);
    }
    get argumentHint() {
        return this.getStringAttribute(PromptHeaderAttributes.argumentHint);
    }
    get target() {
        return this.getStringAttribute(PromptHeaderAttributes.target);
    }
    get infer() {
        return this.getBooleanAttribute(PromptHeaderAttributes.infer);
    }
    get tools() {
        const toolsAttribute = this._parsedHeader.attributes.find(attr => attr.key === PromptHeaderAttributes.tools);
        if (!toolsAttribute) {
            return undefined;
        }
        let value = toolsAttribute.value;
        if (value.type === 'scalar') {
            value = parseCommaSeparatedList(value);
        }
        if (value.type === 'sequence') {
            const tools = [];
            for (const item of value.items) {
                if (item.type === 'scalar' && item.value) {
                    tools.push(item.value);
                }
            }
            return tools;
        }
        return undefined;
    }
    get handOffs() {
        const handoffsAttribute = this._parsedHeader.attributes.find(attr => attr.key === PromptHeaderAttributes.handOffs);
        if (!handoffsAttribute) {
            return undefined;
        }
        if (handoffsAttribute.value.type === 'sequence') {
            // Array format: list of objects: { agent, label, prompt, send?, showContinueOn?, model? }
            const handoffs = [];
            for (const item of handoffsAttribute.value.items) {
                if (item.type === 'map') {
                    let agent;
                    let label;
                    let prompt;
                    let send;
                    let showContinueOn;
                    let model;
                    for (const prop of item.properties) {
                        if (prop.key.value === 'agent' && prop.value.type === 'scalar') {
                            agent = prop.value.value;
                        }
                        else if (prop.key.value === 'label' && prop.value.type === 'scalar') {
                            label = prop.value.value;
                        }
                        else if (prop.key.value === 'prompt' && prop.value.type === 'scalar') {
                            prompt = prop.value.value;
                        }
                        else if (prop.key.value === 'send' && prop.value.type === 'scalar') {
                            send = parseBoolean(prop.value);
                        }
                        else if (prop.key.value === 'showContinueOn' && prop.value.type === 'scalar') {
                            showContinueOn = parseBoolean(prop.value);
                        }
                        else if (prop.key.value === 'model' && prop.value.type === 'scalar') {
                            model = prop.value.value;
                        }
                    }
                    if (agent && label?.trim() && prompt !== undefined) {
                        const handoff = {
                            agent,
                            label,
                            prompt,
                            ...(send !== undefined ? { send } : {}),
                            ...(showContinueOn !== undefined ? { showContinueOn } : {}),
                            ...(model !== undefined ? { model } : {})
                        };
                        handoffs.push(handoff);
                    }
                }
            }
            return handoffs;
        }
        return undefined;
    }
    getStringArrayAttribute(key) {
        const attribute = this._parsedHeader.attributes.find(attr => attr.key === key);
        if (!attribute) {
            return undefined;
        }
        if (attribute.value.type === 'sequence') {
            const result = [];
            for (const item of attribute.value.items) {
                if (item.type === 'scalar' && item.value) {
                    result.push(item.value);
                }
            }
            return result;
        }
        return undefined;
    }
    getStringOrStringArrayAttribute(key) {
        const attribute = this._parsedHeader.attributes.find(attr => attr.key === key);
        if (!attribute) {
            return undefined;
        }
        if (attribute.value.type === 'scalar') {
            return [attribute.value.value];
        }
        if (attribute.value.type === 'sequence') {
            const result = [];
            for (const item of attribute.value.items) {
                if (item.type === 'scalar') {
                    result.push(item.value);
                }
            }
            return result;
        }
        return undefined;
    }
    get agents() {
        return this.getStringArrayAttribute(PromptHeaderAttributes.agents);
    }
    get userInvocable() {
        return this.getBooleanAttribute(PromptHeaderAttributes.userInvocable);
    }
    get disableModelInvocation() {
        return this.getBooleanAttribute(PromptHeaderAttributes.disableModelInvocation);
    }
    /**
     * Gets the raw 'hooks' attribute value from the header.
     * Returns the YAML map value if present, or undefined. The caller is
     * responsible for converting this to `ChatRequestHooks` via
     * {@link parseSubagentHooksFromYaml}.
     */
    get hooksRaw() {
        const attr = this._parsedHeader.attributes.find(a => a.key === PromptHeaderAttributes.hooks);
        if (attr?.value.type === 'map') {
            return attr.value;
        }
        return undefined;
    }
    getBooleanAttribute(key) {
        const attribute = this._parsedHeader.attributes.find(attr => attr.key === key);
        if (attribute?.value.type === 'scalar') {
            return parseBoolean(attribute.value);
        }
        return undefined;
    }
}
function parseBoolean(stringValue) {
    if (stringValue.value === 'true') {
        return true;
    }
    else if (stringValue.value === 'false') {
        return false;
    }
    return undefined;
}
export class PromptBody {
    constructor(range, linesWithEOL, uri) {
        this.range = range;
        this.linesWithEOL = linesWithEOL;
        this.uri = uri;
    }
    get fileReferences() {
        return this.getParsedBody().fileReferences;
    }
    get variableReferences() {
        return this.getParsedBody().variableReferences;
    }
    get offset() {
        return this.getParsedBody().bodyOffset;
    }
    getParsedBody() {
        if (this._parsed === undefined) {
            const markdownLinkRanges = [];
            const fileReferences = [];
            const variableReferences = [];
            const bodyOffset = Iterable.reduce(Iterable.slice(this.linesWithEOL, 0, this.range.startLineNumber - 1), (len, line) => line.length + len, 0);
            let inFencedCodeBlock = false;
            let fencedCodeBlockFenceChar;
            let fencedCodeBlockFenceLength = 0;
            for (let i = this.range.startLineNumber - 1, lineStartOffset = bodyOffset; i < this.range.endLineNumber - 1; i++) {
                const line = this.linesWithEOL[i];
                const trimmedLine = line.trimStart();
                // Detect fenced code block lines (``` or ~~~, 3 or more chars)
                const fenceMatch = /^(?<fence>(`{3,}|~{3,}))/u.exec(trimmedLine);
                if (fenceMatch) {
                    const fence = fenceMatch.groups.fence;
                    const fenceChar = fence[0];
                    const fenceLength = fence.length;
                    const restOfLine = trimmedLine.slice(fence.length);
                    if (!inFencedCodeBlock) {
                        // Opening fence: record fence char/length and enter fenced code block
                        inFencedCodeBlock = true;
                        fencedCodeBlockFenceChar = fenceChar;
                        fencedCodeBlockFenceLength = fenceLength;
                        lineStartOffset += line.length;
                        continue;
                    }
                    // Potential closing fence: must match fence char and have at least the same length,
                    // and only whitespace is allowed after the fence.
                    if (fencedCodeBlockFenceChar === fenceChar && fenceLength >= fencedCodeBlockFenceLength && /^\s*$/.test(restOfLine)) {
                        inFencedCodeBlock = false;
                        fencedCodeBlockFenceChar = undefined;
                        fencedCodeBlockFenceLength = 0;
                        lineStartOffset += line.length;
                        continue;
                    }
                }
                // Skip all lines inside fenced code blocks
                if (inFencedCodeBlock) {
                    lineStartOffset += line.length;
                    continue;
                }
                // Collect inline code spans (backtick-delimited) to exclude from matching
                const inlineCodeRanges = [];
                for (const inlineMatch of line.matchAll(/`[^`]+`/g)) {
                    inlineCodeRanges.push({ start: inlineMatch.index, end: inlineMatch.index + inlineMatch[0].length });
                }
                const isInsideInlineCode = (offset) => {
                    return inlineCodeRanges.some(r => offset >= r.start && offset < r.end);
                };
                // Match markdown links: [text](link)
                const linkMatch = line.matchAll(/\[(.*?)\]\((.+?)\)/g);
                for (const match of linkMatch) {
                    if (match.index > 0 && line[match.index - 1] === '!') {
                        continue; // skip image links
                    }
                    if (isInsideInlineCode(match.index)) {
                        continue; // skip matches inside inline code
                    }
                    const linkEndOffset = match.index + match[0].length - 1; // before the parenthesis
                    const linkStartOffset = match.index + match[0].length - match[2].length - 1;
                    const range = new Range(i + 1, linkStartOffset + 1, i + 1, linkEndOffset + 1);
                    fileReferences.push({ content: match[2], range, isMarkdownLink: true });
                    markdownLinkRanges.push(new Range(i + 1, match.index + 1, i + 1, match.index + match[0].length + 1));
                }
                // Match #file:<filePath> and #tool:<toolName>
                // Regarding the <toolName> pattern below, see also the variableReg regex in chatRequestParser.ts.
                const reg = /#file:(?<filePath>[^\s#]+)|#tool:(?<toolName>[\w_\-\.\/]+)/gi;
                const matches = line.matchAll(reg);
                for (const match of matches) {
                    const fullMatch = match[0];
                    const fullRange = new Range(i + 1, match.index + 1, i + 1, match.index + fullMatch.length + 1);
                    if (markdownLinkRanges.some(mdRange => Range.areIntersectingOrTouching(mdRange, fullRange))) {
                        continue;
                    }
                    if (isInsideInlineCode(match.index)) {
                        continue; // skip matches inside inline code
                    }
                    const contentMatch = match.groups?.['filePath'] || match.groups?.['toolName'];
                    if (!contentMatch) {
                        continue;
                    }
                    const startOffset = match.index + fullMatch.length - contentMatch.length;
                    const endOffset = match.index + fullMatch.length;
                    const range = new Range(i + 1, startOffset + 1, i + 1, endOffset + 1);
                    if (match.groups?.['filePath']) {
                        fileReferences.push({ content: match.groups?.['filePath'], range, isMarkdownLink: false });
                    }
                    else if (match.groups?.['toolName']) {
                        variableReferences.push({ name: match.groups?.['toolName'], range, offset: lineStartOffset + match.index, fullLength: fullMatch.length });
                    }
                }
                lineStartOffset += line.length;
            }
            this._parsed = { fileReferences: fileReferences.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range)), variableReferences, bodyOffset };
        }
        return this._parsed;
    }
    getContent() {
        return this.linesWithEOL.slice(this.range.startLineNumber - 1, this.range.endLineNumber - 1).join('');
    }
    resolveFilePath(path) {
        try {
            if (path.startsWith('/')) {
                return this.uri.with({ path });
            }
            else if (path.match(/^[a-zA-Z]+:\//)) {
                return URI.parse(path);
            }
            else {
                const dirName = dirname(this.uri);
                return joinPath(dirName, path);
            }
        }
        catch {
            return undefined;
        }
    }
}
/**
 * Parses a comma-separated list of values into an array of strings.
 * Values can be unquoted or quoted (single or double quotes).
 *
 * @param input A string containing comma-separated values
 * @returns An ISequenceValue containing the parsed values and their ranges
 */
export function parseCommaSeparatedList(stringValue) {
    const result = [];
    const input = stringValue.value;
    const positionOffset = stringValue.range.getStartPosition();
    let pos = 0;
    const isWhitespace = (char) => char === ' ' || char === '\t';
    while (pos < input.length) {
        // Skip leading whitespace
        while (pos < input.length && isWhitespace(input[pos])) {
            pos++;
        }
        if (pos >= input.length) {
            break;
        }
        const startPos = pos;
        let value = '';
        let endPos;
        let quoteStyle;
        const char = input[pos];
        if (char === '"' || char === `'`) {
            // Quoted string
            const quote = char;
            pos++; // Skip opening quote
            while (pos < input.length && input[pos] !== quote) {
                value += input[pos];
                pos++;
            }
            endPos = pos + 1; // Include closing quote in the range
            if (pos < input.length) {
                pos++;
            }
            quoteStyle = quote === '"' ? 'double' : 'single';
        }
        else {
            // Unquoted string - read until comma or end
            const startPos = pos;
            while (pos < input.length && input[pos] !== ',') {
                value += input[pos];
                pos++;
            }
            value = value.trimEnd();
            endPos = startPos + value.length;
            quoteStyle = 'none';
        }
        result.push({ type: 'scalar', value: value, range: new Range(positionOffset.lineNumber, positionOffset.column + startPos, positionOffset.lineNumber, positionOffset.column + endPos), format: quoteStyle });
        // Skip whitespace after value
        while (pos < input.length && isWhitespace(input[pos])) {
            pos++;
        }
        // Skip comma if present
        if (pos < input.length && input[pos] === ',') {
            pos++;
        }
    }
    return { type: 'sequence', items: result, range: stringValue.range };
}
/**
 * Returns the effective `applyTo` pattern for an instruction file.
 * Claude rules use `paths` (defaulting to `**`), while regular instructions use `applyTo`.
 */
export function evaluateApplyToPattern(header, isClaudeRules) {
    if (isClaudeRules) {
        return header?.paths?.join(', ') ?? '**';
    }
    return header?.applyTo;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0RmlsZVBhcnNlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUGFyc2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsS0FBSyxFQUE0QixNQUFNLG9DQUFvQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUUzRyxNQUFNLE9BQU8sZ0JBQWdCO0lBQzVCO0lBQ0EsQ0FBQztJQUVNLEtBQUssQ0FBQyxHQUFRLEVBQUUsT0FBZTtRQUNyQyxNQUFNLFlBQVksR0FBRywyQkFBMkIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMxRCxJQUFJLFlBQVksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDL0IsT0FBTyxJQUFJLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDeEQsQ0FBQztRQUNELElBQUksTUFBTSxHQUE2QixTQUFTLENBQUM7UUFDakQsSUFBSSxJQUFJLEdBQTJCLFNBQVMsQ0FBQztRQUM3QyxJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUM7UUFDdEIsSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FB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