/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isPowerShell } from '../../runInTerminalHelpers.js';
/**
 * Command line presenter for Node.js inline commands (`node -e "..."`).
 * Extracts the JavaScript code and sets up JavaScript syntax highlighting.
 */
export class NodeCommandLinePresenter {
    present(options) {
        const commandLine = options.commandLine.forDisplay;
        const extractedNode = extractNodeCommand(commandLine, options.shell, options.os);
        if (extractedNode) {
            return {
                commandLine: extractedNode,
                language: 'javascript',
                languageDisplayName: 'Node.js',
            };
        }
        return undefined;
    }
}
/**
 * Extracts the JavaScript code from a `node -e "..."` or `node -e '...'` command,
 * returning the code with properly unescaped quotes.
 *
 * @param commandLine The full command line to parse
 * @param shell The shell path (to determine quote escaping style)
 * @param os The operating system
 * @returns The extracted JavaScript code, or undefined if not a node -e/--eval command
 */
export function extractNodeCommand(commandLine, shell, os) {
    // Match node/nodejs -e/--eval "..." pattern (double quotes)
    const doubleQuoteMatch = commandLine.match(/^node(?:js)?\s+(?:-e|--eval)\s+"(?<code>.+)"$/s);
    if (doubleQuoteMatch?.groups?.code) {
        let jsCode = doubleQuoteMatch.groups.code.trim();
        // Unescape quotes based on shell type
        if (isPowerShell(shell, os)) {
            // PowerShell uses backtick-quote (`") to escape quotes inside double-quoted strings
            jsCode = jsCode.replace(/`"/g, '"');
        }
        else {
            // Bash/sh/zsh use backslash-quote (\")
            jsCode = jsCode.replace(/\\"/g, '"');
        }
        return jsCode;
    }
    // Match node/nodejs -e/--eval '...' pattern (single quotes)
    // Single quotes in bash/sh/zsh are literal - no escaping inside
    // Single quotes in PowerShell are also literal
    const singleQuoteMatch = commandLine.match(/^node(?:js)?\s+(?:-e|--eval)\s+'(?<code>.+)'$/s);
    if (singleQuoteMatch?.groups?.code) {
        return singleQuoteMatch.groups.code.trim();
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZUNvbW1hbmRMaW5lUHJlc2VudGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL2Jyb3dzZXIvdG9vbHMvY29tbWFuZExpbmVQcmVzZW50ZXIvbm9kZUNvbW1hbmRMaW5lUHJlc2VudGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUc3RDs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sd0JBQXdCO0lBQ3BDLE9BQU8sQ0FBQyxPQUFxQztRQUM1QyxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQztRQUNuRCxNQUFNLGFBQWEsR0FBRyxrQkFBa0IsQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDakYsSUFBSSxhQUFhLEVBQUUsQ0FBQztZQUNuQixPQUFPO2dCQUNOLFdBQVcsRUFBRSxhQUFhO2dCQUMxQixRQUFRLEVBQUUsWUFBWTtnQkFDdEIsbUJBQW1CLEVBQUUsU0FBUzthQUM5QixDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7Q0FDRDtBQUVEOzs7Ozs7OztHQVFHO0FBQ0gsTUFBTSxVQUFVLGtCQUFrQixDQUFDLFdBQW1CLEVBQUUsS0FBYSxFQUFFLEVBQW1CO0lBQ3pGLDREQUE0RDtJQUM1RCxNQUFNLGdCQUFnQixHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsZ0RBQWdELENBQUMsQ0FBQztJQUM3RixJQUFJLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQztRQUNwQyxJQUFJLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBRWpELHNDQUFzQztRQUN0QyxJQUFJLFlBQVksQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUM3QixvRkFBb0Y7WUFDcEYsTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3JDLENBQUM7YUFBTSxDQUFDO1lBQ1AsdUNBQXVDO1lBQ3ZDLE1BQU0sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN0QyxDQUFDO1FBRUQsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBRUQsNERBQTREO0lBQzVELGdFQUFnRTtJQUNoRSwrQ0FBK0M7SUFDL0MsTUFBTSxnQkFBZ0IsR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7SUFDN0YsSUFBSSxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUM7UUFDcEMsT0FBTyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzVDLENBQUM7SUFFRCxPQUFPLFNBQVMsQ0FBQztBQUNsQixDQUFDIn0=