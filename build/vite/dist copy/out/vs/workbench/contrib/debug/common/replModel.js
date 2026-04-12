/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import severity from '../../../../base/common/severity.js';
import { isObject, isString } from '../../../../base/common/types.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import * as nls from '../../../../nls.js';
import { ExpressionContainer } from './debugModel.js';
let topReplElementCounter = 0;
const getUniqueId = () => `topReplElement:${topReplElementCounter++}`;
/**
 * General case of data from DAP the `output` event. {@link ReplVariableElement}
 * is used instead only if there is a `variablesReference` with no `output` text.
 */
export class ReplOutputElement {
    constructor(session, id, value, severity, sourceData, expression) {
        this.session = session;
        this.id = id;
        this.value = value;
        this.severity = severity;
        this.sourceData = sourceData;
        this.expression = expression;
        this._count = 1;
        this._onDidChangeCount = new Emitter();
    }
    toString(includeSource = false) {
        let valueRespectCount = this.value;
        for (let i = 1; i < this.count; i++) {
            valueRespectCount += (valueRespectCount.endsWith('\n') ? '' : '\n') + this.value;
        }
        const sourceStr = (this.sourceData && includeSource) ? ` ${this.sourceData.source.name}` : '';
        return valueRespectCount + sourceStr;
    }
    getId() {
        return this.id;
    }
    getChildren() {
        return this.expression?.getChildren() || Promise.resolve([]);
    }
    set count(value) {
        this._count = value;
        this._onDidChangeCount.fire();
    }
    get count() {
        return this._count;
    }
    get onDidChangeCount() {
        return this._onDidChangeCount.event;
    }
    get hasChildren() {
        return !!this.expression?.hasChildren;
    }
}
/** Top-level variable logged via DAP output when there's no `output` string */
export class ReplVariableElement {
    constructor(session, expression, severity, sourceData) {
        this.session = session;
        this.expression = expression;
        this.severity = severity;
        this.sourceData = sourceData;
        this.id = generateUuid();
        this.hasChildren = expression.hasChildren;
    }
    getSession() {
        return this.session;
    }
    getChildren() {
        return this.expression.getChildren();
    }
    toString() {
        return this.expression.toString();
    }
    getId() {
        return this.id;
    }
}
export class RawObjectReplElement {
    static { this.MAX_CHILDREN = 1000; } // upper bound of children per value
    constructor(id, name, valueObj, sourceData, annotation) {
        this.id = id;
        this.name = name;
        this.valueObj = valueObj;
        this.sourceData = sourceData;
        this.annotation = annotation;
    }
    getId() {
        return this.id;
    }
    getSession() {
        return undefined;
    }
    get value() {
        if (this.valueObj === null) {
            return 'null';
        }
        else if (Array.isArray(this.valueObj)) {
            return `Array[${this.valueObj.length}]`;
        }
        else if (isObject(this.valueObj)) {
            return 'Object';
        }
        else if (isString(this.valueObj)) {
            return `"${this.valueObj}"`;
        }
        return String(this.valueObj) || '';
    }
    get hasChildren() {
        return (Array.isArray(this.valueObj) && this.valueObj.length > 0) || (isObject(this.valueObj) && Object.getOwnPropertyNames(this.valueObj).length > 0);
    }
    evaluateLazy() {
        throw new Error('Method not implemented.');
    }
    getChildren() {
        let result = [];
        if (Array.isArray(this.valueObj)) {
            result = this.valueObj.slice(0, RawObjectReplElement.MAX_CHILDREN)
                .map((v, index) => new RawObjectReplElement(`${this.id}:${index}`, String(index), v));
        }
        else if (isObject(this.valueObj)) {
            result = Object.getOwnPropertyNames(this.valueObj).slice(0, RawObjectReplElement.MAX_CHILDREN)
                .map((key, index) => new RawObjectReplElement(`${this.id}:${index}`, key, this.valueObj[key]));
        }
        return Promise.resolve(result);
    }
    toString() {
        return `${this.name}\n${this.value}`;
    }
}
export class ReplEvaluationInput {
    constructor(value) {
        this.value = value;
        this.id = generateUuid();
    }
    toString() {
        return this.value;
    }
    getId() {
        return this.id;
    }
}
export class ReplEvaluationResult extends ExpressionContainer {
    get available() {
        return this._available;
    }
    constructor(originalExpression) {
        super(undefined, undefined, 0, generateUuid());
        this.originalExpression = originalExpression;
        this._available = true;
    }
    async evaluateExpression(expression, session, stackFrame, context) {
        const result = await super.evaluateExpression(expression, session, stackFrame, context);
        this._available = result;
        return result;
    }
    toString() {
        return `${this.value}`;
    }
}
export class ReplGroup {
    static { this.COUNTER = 0; }
    constructor(session, name, autoExpand, sourceData) {
        this.session = session;
        this.name = name;
        this.autoExpand = autoExpand;
        this.sourceData = sourceData;
        this.children = [];
        this.ended = false;
        this.id = `replGroup:${ReplGroup.COUNTER++}`;
    }
    get hasChildren() {
        return true;
    }
    getId() {
        return this.id;
    }
    toString(includeSource = false) {
        const sourceStr = (includeSource && this.sourceData) ? ` ${this.sourceData.source.name}` : '';
        return this.name + sourceStr;
    }
    addChild(child) {
        const lastElement = this.children.length ? this.children[this.children.length - 1] : undefined;
        if (lastElement instanceof ReplGroup && !lastElement.hasEnded) {
            lastElement.addChild(child);
        }
        else {
            this.children.push(child);
        }
    }
    getChildren() {
        return this.children;
    }
    end() {
        const lastElement = this.children.length ? this.children[this.children.length - 1] : undefined;
        if (lastElement instanceof ReplGroup && !lastElement.hasEnded) {
            lastElement.end();
        }
        else {
            this.ended = true;
        }
    }
    get hasEnded() {
        return this.ended;
    }
}
function areSourcesEqual(first, second) {
    if (!first && !second) {
        return true;
    }
    if (first && second) {
        return first.column === second.column && first.lineNumber === second.lineNumber && first.source.uri.toString() === second.source.uri.toString();
    }
    return false;
}
export class ReplModel {
    constructor(configurationService) {
        this.configurationService = configurationService;
        this.replElements = [];
        this._onDidChangeElements = new Emitter();
        this.onDidChangeElements = this._onDidChangeElements.event;
    }
    getReplElements() {
        return this.replElements;
    }
    async addReplExpression(session, stackFrame, expression) {
        this.addReplElement(new ReplEvaluationInput(expression));
        const result = new ReplEvaluationResult(expression);
        await result.evaluateExpression(expression, session, stackFrame, 'repl');
        this.addReplElement(result);
    }
    appendToRepl(session, { output, expression, sev, source }) {
        const clearAnsiSequence = '\u001b[2J';
        const clearAnsiIndex = output.lastIndexOf(clearAnsiSequence);
        if (clearAnsiIndex !== -1) {
            // [2J is the ansi escape sequence for clearing the display http://ascii-table.com/ansi-escape-sequences.php
            this.removeReplExpressions();
            this.appendToRepl(session, { output: nls.localize('consoleCleared', "Console was cleared"), sev: severity.Ignore });
            output = output.substring(clearAnsiIndex + clearAnsiSequence.length);
        }
        if (expression) {
            // if there is an output string, prefer to show that, since the DA could
            // have formatted it nicely e.g. with ANSI color codes.
            this.addReplElement(output
                ? new ReplOutputElement(session, getUniqueId(), output, sev, source, expression)
                : new ReplVariableElement(session, expression, sev, source));
            return;
        }
        this.appendOutputToRepl(session, output, sev, source);
    }
    appendOutputToRepl(session, output, sev, source) {
        const config = this.configurationService.getValue('debug');
        const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : undefined;
        // Handle concatenation of incomplete lines first
        if (previousElement instanceof ReplOutputElement && previousElement.severity === sev && areSourcesEqual(previousElement.sourceData, source)) {
            if (!previousElement.value.endsWith('\n') && !previousElement.value.endsWith('\r\n') && previousElement.count === 1) {
                // Concatenate with previous incomplete line
                const combinedOutput = previousElement.value + output;
                this.replElements[this.replElements.length - 1] = new ReplOutputElement(session, getUniqueId(), combinedOutput, sev, source);
                this._onDidChangeElements.fire(undefined);
                // If the combined output now forms a complete line and collapsing is enabled,
                // check if it can be collapsed with previous elements
                if (config.console.collapseIdenticalLines && combinedOutput.endsWith('\n')) {
                    this.tryCollapseCompleteLine(sev, source);
                }
                // If the combined output contains multiple lines, apply line-level collapsing
                if (config.console.collapseIdenticalLines && combinedOutput.includes('\n')) {
                    const lines = this.splitIntoLines(combinedOutput);
                    if (lines.length > 1) {
                        this.applyLineLevelCollapsing(session, sev, source);
                    }
                }
                return;
            }
        }
        // If collapsing is enabled and the output contains line breaks, parse and collapse at line level
        if (config.console.collapseIdenticalLines && output.includes('\n')) {
            this.processMultiLineOutput(session, output, sev, source);
        }
        else {
            // For simple output without line breaks, use the original logic
            if (previousElement instanceof ReplOutputElement && previousElement.severity === sev && areSourcesEqual(previousElement.sourceData, source)) {
                if (previousElement.value === output && config.console.collapseIdenticalLines) {
                    previousElement.count++;
                    // No need to fire an event, just the count updates and badge will adjust automatically
                    return;
                }
            }
            const element = new ReplOutputElement(session, getUniqueId(), output, sev, source);
            this.addReplElement(element);
        }
    }
    tryCollapseCompleteLine(sev, source) {
        // Try to collapse the last element with the second-to-last if they are identical complete lines
        if (this.replElements.length < 2) {
            return;
        }
        const lastElement = this.replElements[this.replElements.length - 1];
        const secondToLastElement = this.replElements[this.replElements.length - 2];
        if (lastElement instanceof ReplOutputElement &&
            secondToLastElement instanceof ReplOutputElement &&
            lastElement.severity === sev &&
            secondToLastElement.severity === sev &&
            areSourcesEqual(lastElement.sourceData, source) &&
            areSourcesEqual(secondToLastElement.sourceData, source) &&
            lastElement.value === secondToLastElement.value &&
            lastElement.count === 1 &&
            lastElement.value.endsWith('\n')) {
            // Collapse the last element into the second-to-last
            secondToLastElement.count += lastElement.count;
            this.replElements.pop();
            this._onDidChangeElements.fire(undefined);
        }
    }
    processMultiLineOutput(session, output, sev, source) {
        // Split output into lines, preserving line endings
        const lines = this.splitIntoLines(output);
        for (const line of lines) {
            if (line.length === 0) {
                continue;
            }
            const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : undefined;
            // Check if this line can be collapsed with the previous one
            if (previousElement instanceof ReplOutputElement &&
                previousElement.severity === sev &&
                areSourcesEqual(previousElement.sourceData, source) &&
                previousElement.value === line) {
                previousElement.count++;
                // No need to fire an event, just the count updates and badge will adjust automatically
            }
            else {
                const element = new ReplOutputElement(session, getUniqueId(), line, sev, source);
                this.addReplElement(element);
            }
        }
    }
    splitIntoLines(text) {
        // Split text into lines while preserving line endings, using indexOf for efficiency
        const lines = [];
        let start = 0;
        while (start < text.length) {
            const nextLF = text.indexOf('\n', start);
            if (nextLF === -1) {
                lines.push(text.substring(start));
                break;
            }
            lines.push(text.substring(start, nextLF + 1));
            start = nextLF + 1;
        }
        return lines;
    }
    applyLineLevelCollapsing(session, sev, source) {
        // Apply line-level collapsing to the last element if it contains multiple lines
        const lastElement = this.replElements[this.replElements.length - 1];
        if (!(lastElement instanceof ReplOutputElement) || lastElement.severity !== sev || !areSourcesEqual(lastElement.sourceData, source)) {
            return;
        }
        const lines = this.splitIntoLines(lastElement.value);
        if (lines.length <= 1) {
            return; // No multiple lines to collapse
        }
        // Remove the last element and reprocess it as multiple lines
        this.replElements.pop();
        // Process each line and try to collapse with existing elements
        for (const line of lines) {
            if (line.length === 0) {
                continue;
            }
            const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : undefined;
            // Check if this line can be collapsed with the previous one
            if (previousElement instanceof ReplOutputElement &&
                previousElement.severity === sev &&
                areSourcesEqual(previousElement.sourceData, source) &&
                previousElement.value === line) {
                previousElement.count++;
            }
            else {
                const element = new ReplOutputElement(session, getUniqueId(), line, sev, source);
                this.addReplElement(element);
            }
        }
        this._onDidChangeElements.fire(undefined);
    }
    startGroup(session, name, autoExpand, sourceData) {
        const group = new ReplGroup(session, name, autoExpand, sourceData);
        this.addReplElement(group);
    }
    endGroup() {
        const lastElement = this.replElements[this.replElements.length - 1];
        if (lastElement instanceof ReplGroup) {
            lastElement.end();
        }
    }
    addReplElement(newElement) {
        const lastElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : undefined;
        if (lastElement instanceof ReplGroup && !lastElement.hasEnded) {
            lastElement.addChild(newElement);
        }
        else {
            this.replElements.push(newElement);
            const config = this.configurationService.getValue('debug');
            if (this.replElements.length > config.console.maximumLines) {
                this.replElements.splice(0, this.replElements.length - config.console.maximumLines);
            }
        }
        this._onDidChangeElements.fire(newElement);
    }
    removeReplExpressions() {
        if (this.replElements.length > 0) {
            this.replElements = [];
            this._onDidChangeElements.fire(undefined);
        }
    }
    /** Returns a new REPL model that's a copy of this one. */
    clone() {
        const newRepl = new ReplModel(this.configurationService);
        newRepl.replElements = this.replElements.slice();
        return newRepl;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbE1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvY29tbW9uL3JlcGxNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxRQUFRLE1BQU0scUNBQXFDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDL0QsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUcxQyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUV0RCxJQUFJLHFCQUFxQixHQUFHLENBQUMsQ0FBQztBQUM5QixNQUFNLFdBQVcsR0FBRyxHQUFHLEVBQUUsQ0FBQyxrQkFBa0IscUJBQXFCLEVBQUUsRUFBRSxDQUFDO0FBRXRFOzs7R0FHRztBQUNILE1BQU0sT0FBTyxpQkFBaUI7SUFLN0IsWUFDUSxPQUFzQixFQUNyQixFQUFVLEVBQ1gsS0FBYSxFQUNiLFFBQWtCLEVBQ2xCLFVBQStCLEVBQ3RCLFVBQXdCO1FBTGpDLFlBQU8sR0FBUCxPQUFPLENBQWU7UUFDckIsT0FBRSxHQUFGLEVBQUUsQ0FBUTtRQUNYLFVBQUssR0FBTCxLQUFLLENBQVE7UUFDYixhQUFRLEdBQVIsUUFBUSxDQUFVO1FBQ2xCLGVBQVUsR0FBVixVQUFVLENBQXFCO1FBQ3RCLGVBQVUsR0FBVixVQUFVLENBQWM7UUFUakMsV0FBTSxHQUFHLENBQUMsQ0FBQztRQUNYLHNCQUFpQixHQUFHLElBQUksT0FBTyxFQUFRLENBQUM7SUFVaEQsQ0FBQztJQUVELFFBQVEsQ0FBQyxhQUFhLEdB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