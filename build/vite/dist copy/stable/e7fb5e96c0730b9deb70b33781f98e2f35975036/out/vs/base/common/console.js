/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from './uri.js';
export function isRemoteConsoleLog(obj) {
    const entry = obj;
    return entry && typeof entry.type === 'string' && typeof entry.severity === 'string';
}
export function parse(entry) {
    const args = [];
    let stack;
    // Parse Entry
    try {
        const parsedArguments = JSON.parse(entry.arguments);
        // Check for special stack entry as last entry
        const stackArgument = parsedArguments[parsedArguments.length - 1];
        if (stackArgument && stackArgument.__$stack) {
            parsedArguments.pop(); // stack is handled specially
            stack = stackArgument.__$stack;
        }
        args.push(...parsedArguments);
    }
    catch (error) {
        args.push('Unable to log remote console arguments', entry.arguments);
    }
    return { args, stack };
}
export function getFirstFrame(arg0) {
    if (typeof arg0 !== 'string') {
        return getFirstFrame(parse(arg0).stack);
    }
    // Parse a source information out of the stack if we have one. Format can be:
    // at vscode.commands.registerCommand (/Users/someone/Desktop/test-ts/out/src/extension.js:18:17)
    // or
    // at /Users/someone/Desktop/test-ts/out/src/extension.js:18:17
    // or
    // at c:\Users\someone\Desktop\end-js\extension.js:19:17
    // or
    // at e.$executeContributedCommand(c:\Users\someone\Desktop\end-js\extension.js:19:17)
    const stack = arg0;
    if (stack) {
        const topFrame = findFirstFrame(stack);
        // at [^\/]* => line starts with "at" followed by any character except '/' (to not capture unix paths too late)
        // (?:(?:[a-zA-Z]+:)|(?:[\/])|(?:\\\\) => windows drive letter OR unix root OR unc root
        // (?:.+) => simple pattern for the path, only works because of the line/col pattern after
        // :(?:\d+):(?:\d+) => :line:column data
        const matches = /at [^\/]*((?:(?:[a-zA-Z]+:)|(?:[\/])|(?:\\\\))(?:.+)):(\d+):(\d+)/.exec(topFrame || '');
        if (matches && matches.length === 4) {
            return {
                uri: URI.file(matches[1]),
                line: Number(matches[2]),
                column: Number(matches[3])
            };
        }
    }
    return undefined;
}
function findFirstFrame(stack) {
    if (!stack) {
        return stack;
    }
    const newlineIndex = stack.indexOf('\n');
    if (newlineIndex === -1) {
        return stack;
    }
    return stack.substring(0, newlineIndex);
}
export function log(entry, label) {
    const { args, stack } = parse(entry);
    const isOneStringArg = typeof args[0] === 'string' && args.length === 1;
    let topFrame = findFirstFrame(stack);
    if (topFrame) {
        topFrame = `(${topFrame.trim()})`;
    }
    let consoleArgs = [];
    // First arg is a string
    if (typeof args[0] === 'string') {
        if (topFrame && isOneStringArg) {
            consoleArgs = [`%c[${label}] %c${args[0]} %c${topFrame}`, color('blue'), color(''), color('grey')];
        }
        else {
            consoleArgs = [`%c[${label}] %c${args[0]}`, color('blue'), color(''), ...args.slice(1)];
        }
    }
    // First arg is something else, just apply all
    else {
        consoleArgs = [`%c[${label}]%`, color('blue'), ...args];
    }
    // Stack: add to args unless already added
    if (topFrame && !isOneStringArg) {
        consoleArgs.push(topFrame);
    }
    // Log it
    // eslint-disable-next-line local/code-no-any-casts
    if (typeof console[entry.severity] !== 'function') {
        throw new Error('Unknown console method');
    }
    // eslint-disable-next-line local/code-no-any-casts
    console[entry.severity].apply(console, consoleArgs);
}
function color(color) {
    return `color: ${color}`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc29sZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2NvbnNvbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQWtCL0IsTUFBTSxVQUFVLGtCQUFrQixDQUFDLEdBQVk7SUFDOUMsTUFBTSxLQUFLLEdBQUcsR0FBd0IsQ0FBQztJQUV2QyxPQUFPLEtBQUssSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLE9BQU8sS0FBSyxDQUFDLFFBQVEsS0FBSyxRQUFRLENBQUM7QUFDdEYsQ0FBQztBQUVELE1BQU0sVUFBVSxLQUFLLENBQUMsS0FBd0I7SUFDN0MsTUFBTSxJQUFJLEdBQVUsRUFBRSxDQUFDO0lBQ3ZCLElBQUksS0FBeUIsQ0FBQztJQUU5QixjQUFjO0lBQ2QsSUFBSSxDQUFDO1FBQ0osTUFBTSxlQUFlLEdBQVUsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFM0QsOENBQThDO1FBQzlDLE1BQU0sYUFBYSxHQUFHLGVBQWUsQ0FBQyxlQUFlLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBbUIsQ0FBQztRQUNwRixJQUFJLGFBQWEsSUFBSSxhQUFhLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDN0MsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsNkJBQTZCO1lBQ3BELEtBQUssR0FBRyxhQUFhLENBQUMsUUFBUSxDQUFDO1FBQ2hDLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsZUFBZSxDQUFDLENBQUM7SUFDL0IsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDaEIsSUFBSSxDQUFDLElBQUksQ0FBQyx3Q0FBd0MsRUFBRSxLQUFLLENBQUMsU0FBUyxD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