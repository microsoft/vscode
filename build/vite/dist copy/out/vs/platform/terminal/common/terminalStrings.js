/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Formats a message from the product to be written to the terminal.
 */
export function formatMessageForTerminal(message, options = {}) {
    let result = '';
    if (!options.excludeLeadingNewLine) {
        result += '\r\n';
    }
    result += '\x1b[0m\x1b[7m * ';
    if (options.loudFormatting) {
        result += '\x1b[0;104m';
    }
    else {
        result += '\x1b[0m';
    }
    result += ` ${message} \x1b[0m\n\r`;
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxTdHJpbmdzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsU3RyaW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQWNoRzs7R0FFRztBQUNILE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxPQUFlLEVBQUUsVUFBeUMsRUFBRTtJQUNwRyxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7SUFDaEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQ3BDLE1BQU0sSUFBSSxNQUFNLENBQUM7SUFDbEIsQ0FBQztJQUNELE1BQU0sSUFBSSxtQkFBbUIsQ0FBQztJQUM5QixJQUFJLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUM1QixNQUFNLElBQUksYUFBYSxDQUFDO0lBQ3pCLENBQUM7U0FBTSxDQUFDO1FBQ1AsTUFBTSxJQUFJLFNBQVMsQ0FBQztJQUNyQixDQUFDO0lBQ0QsTUFBTSxJQUFJLElBQUksT0FBTyxjQUFjLENBQUM7SUFDcEMsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDIn0=