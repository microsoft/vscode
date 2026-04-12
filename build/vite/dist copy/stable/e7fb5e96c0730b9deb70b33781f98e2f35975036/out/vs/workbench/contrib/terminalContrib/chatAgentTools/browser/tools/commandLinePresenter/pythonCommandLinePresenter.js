/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isPowerShell } from '../../runInTerminalHelpers.js';
/**
 * Command line presenter for Python inline commands (`python -c "..."`).
 * Extracts the Python code and sets up Python syntax highlighting.
 */
export class PythonCommandLinePresenter {
    present(options) {
        const commandLine = options.commandLine.forDisplay;
        const extractedPython = extractPythonCommand(commandLine, options.shell, options.os);
        if (extractedPython) {
            return {
                commandLine: extractedPython,
                language: 'python',
                languageDisplayName: 'Python',
            };
        }
        return undefined;
    }
}
/**
 * Extracts the Python code from a `python -c "..."` or `python -c '...'` command,
 * returning the code with properly unescaped quotes.
 *
 * @param commandLine The full command line to parse
 * @param shell The shell path (to determine quote escaping style)
 * @param os The operating system
 * @returns The extracted Python code, or undefined if not a python -c command
 */
export function extractPythonCommand(commandLine, shell, os) {
    // Match python/python3 -c "..." pattern (double quotes)
    const doubleQuoteMatch = commandLine.match(/^python(?:3)?\s+-c\s+"(?<python>.+)"$/s);
    if (doubleQuoteMatch?.groups?.python) {
        let pythonCode = doubleQuoteMatch.groups.python.trim();
        // Unescape quotes based on shell type
        if (isPowerShell(shell, os)) {
            // PowerShell uses backtick-quote (`") to escape quotes inside double-quoted strings
            pythonCode = pythonCode.replace(/`"/g, '"');
        }
        else {
            // Bash/sh/zsh use backslash-quote (\")
            pythonCode = pythonCode.replace(/\\"/g, '"');
        }
        return pythonCode;
    }
    // Match python/python3 -c '...' pattern (single quotes)
    // Single quotes in bash/sh/zsh are literal - no escaping inside
    // Single quotes in PowerShell are also literal
    const singleQuoteMatch = commandLine.match(/^python(?:3)?\s+-c\s+'(?<python>.+)'$/s);
    if (singleQuoteMatch?.groups?.python) {
        return singleQuoteMatch.groups.python.trim();
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHl0aG9uQ29tbWFuZExpbmVQcmVzZW50ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy9jb21tYW5kTGluZVByZXNlbnRlci9weXRob25Db21tYW5kTGluZVByZXNlbnRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHN0Q7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLDBCQUEwQjtJQUN0QyxPQUFPLENBQUMsT0FBcUM7UUFDNUMsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUM7UUFDbkQsTUFBTSxlQUFlLEdBQUcsb0JBQW9CLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3JGLElBQUksZUFBZSxFQUFFLENBQUM7WUFDckIsT0FBTztnQkFDTixXQUFXLEVBQUUsZUFBZTtnQkFDNUIsUUFBUSxFQUFFLFFBQVE7Z0JBQ2xCLG1CQUFtQixFQUFFLFFBQVE7YUFDN0IsQ0FBQztRQUNILENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0NBQ0Q7QUFFRDs7Ozs7Ozs7R0FRRztBQUNILE1BQU0sVUFBVSxvQkFBb0IsQ0FBQyxXQUFtQixFQUFFLEtBQWEsRUFBRSxFQUFtQjtJQUMzRix3REFBd0Q7SUFDeEQsTUFBTSxnQkFBZ0IsR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7SUFDckYsSUFBSSxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUM7UUFDdEMsSUFBSSxVQUFVLEdBQUcsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUV2RCxzQ0FBc0M7UUFDdEMsSUFBSSxZQUFZLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDN0Isb0ZBQW9GO1lBQ3BGLFVBQVUsR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztRQUM3QyxDQUFDO2FBQU0sQ0FBQztZQUNQLHVDQUF1QztZQUN2QyxVQUFVLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUVELE9BQU8sVUFBVSxDQUFDO0lBQ25CLENBQUM7SUFFRCx3REFBd0Q7SUFDeEQsZ0VBQWdFO0lBQ2hFLCtDQUErQztJQUMvQyxNQUFNLGdCQUFnQixHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsd0NBQXdDLENBQUMsQ0FBQztJQUNyRixJQUFJLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsQ0FBQztRQUN0QyxPQUFPLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDOUMsQ0FBQztJQUVELE9BQU8sU0FBUyxDQUFDO0FBQ2xCLENBQUMifQ==