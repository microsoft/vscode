/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isPowerShell } from '../../runInTerminalHelpers.js';
/**
 * Command line presenter for Ruby inline commands (`ruby -e "..."`).
 * Extracts the Ruby code and sets up Ruby syntax highlighting.
 */
export class RubyCommandLinePresenter {
    present(options) {
        const commandLine = options.commandLine.forDisplay;
        const extractedRuby = extractRubyCommand(commandLine, options.shell, options.os);
        if (extractedRuby) {
            return {
                commandLine: extractedRuby,
                language: 'ruby',
                languageDisplayName: 'Ruby',
            };
        }
        return undefined;
    }
}
/**
 * Extracts the Ruby code from a `ruby -e "..."` or `ruby -e '...'` command,
 * returning the code with properly unescaped quotes.
 *
 * @param commandLine The full command line to parse
 * @param shell The shell path (to determine quote escaping style)
 * @param os The operating system
 * @returns The extracted Ruby code, or undefined if not a ruby -e command
 */
export function extractRubyCommand(commandLine, shell, os) {
    // Match ruby -e "..." pattern (double quotes)
    const doubleQuoteMatch = commandLine.match(/^ruby\s+-e\s+"(?<code>.+)"$/s);
    if (doubleQuoteMatch?.groups?.code) {
        let rubyCode = doubleQuoteMatch.groups.code.trim();
        // Return undefined if the trimmed code is empty
        if (!rubyCode) {
            return undefined;
        }
        // Unescape quotes based on shell type
        if (isPowerShell(shell, os)) {
            // PowerShell uses backtick-quote (`") to escape quotes inside double-quoted strings
            rubyCode = rubyCode.replace(/`"/g, '"');
        }
        else {
            // Bash/sh/zsh use backslash-quote (\")
            rubyCode = rubyCode.replace(/\\"/g, '"');
        }
        return rubyCode;
    }
    // Match ruby -e '...' pattern (single quotes)
    // Single quotes in bash/sh/zsh are literal - no escaping inside
    // Single quotes in PowerShell are also literal
    const singleQuoteMatch = commandLine.match(/^ruby\s+-e\s+'(?<code>.+)'$/s);
    if (singleQuoteMatch?.groups?.code) {
        const rubyCode = singleQuoteMatch.groups.code.trim();
        // Return undefined if the trimmed code is empty
        if (!rubyCode) {
            return undefined;
        }
        return rubyCode;
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVieUNvbW1hbmRMaW5lUHJlc2VudGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL2Jyb3dzZXIvdG9vbHMvY29tbWFuZExpbmVQcmVzZW50ZXIvcnVieUNvbW1hbmRMaW5lUHJlc2VudGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUc3RDs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sd0JBQXdCO0lBQ3BDLE9BQU8sQ0FBQyxPQUFxQztRQUM1QyxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQztRQUNuRCxNQUFNLGFBQWEsR0FBRyxrQkFBa0IsQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDakYsSUFBSSxhQUFhLEVBQUUsQ0FBQztZQUNuQixPQUFPO2dCQUNOLFdBQVcsRUFBRSxhQUFhO2dCQUMxQixRQUFRLEVBQUUsTUFBTTtnQkFDaEIsbUJBQW1CLEVBQUUsTUFBTTthQUMzQixDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7Q0FDRDtBQUVEOzs7Ozs7OztHQVFHO0FBQ0gsTUFBTSxVQUFVLGtCQUFrQixDQUFDLFdBQW1CLEVBQUUsS0FBYSxFQUFFLEVBQW1CO0lBQ3pGLDhDQUE4QztJQUM5QyxNQUFNLGdCQUFnQixHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsOEJBQThCLENBQUMsQ0FBQztJQUMzRSxJQUFJLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQztRQUNwQyxJQUFJLFFBQVEsR0FBRyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBRW5ELGdEQUFnRDtRQUNoRCxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsc0NBQXNDO1FBQ3RDLElBQUksWUFBWSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQzdCLG9GQUFvRjtZQUNwRixRQUFRLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDekMsQ0FBQzthQUFNLENBQUM7WUFDUCx1Q0FBdUM7WUFDdkMsUUFBUSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzFDLENBQUM7UUFFRCxPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRUQsOENBQThDO0lBQzlDLGdFQUFnRTtJQUNoRSwrQ0FBK0M7SUFDL0MsTUFBTSxnQkFBZ0IsR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUM7SUFDM0UsSUFBSSxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUM7UUFDcEMsTUFBTSxRQUFRLEdBQUcsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUVyRCxnREFBZ0Q7UUFDaEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFFRCxPQUFPLFNBQVMsQ0FBQztBQUNsQixDQUFDIn0=