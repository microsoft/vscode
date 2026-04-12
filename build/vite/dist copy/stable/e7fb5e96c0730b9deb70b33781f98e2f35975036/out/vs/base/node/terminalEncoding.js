/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This code is also used by standalone cli's. Avoid adding dependencies to keep the size of the cli small.
 */
import { exec } from 'child_process';
import { isWindows } from '../common/platform.js';
const windowsTerminalEncodings = {
    '437': 'cp437', // United States
    '850': 'cp850', // Multilingual(Latin I)
    '852': 'cp852', // Slavic(Latin II)
    '855': 'cp855', // Cyrillic(Russian)
    '857': 'cp857', // Turkish
    '860': 'cp860', // Portuguese
    '861': 'cp861', // Icelandic
    '863': 'cp863', // Canadian - French
    '865': 'cp865', // Nordic
    '866': 'cp866', // Russian
    '869': 'cp869', // Modern Greek
    '936': 'cp936', // Simplified Chinese
    '1252': 'cp1252' // West European Latin
};
function toIconvLiteEncoding(encodingName) {
    const normalizedEncodingName = encodingName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const mapped = JSCHARDET_TO_ICONV_ENCODINGS[normalizedEncodingName];
    return mapped || normalizedEncodingName;
}
const JSCHARDET_TO_ICONV_ENCODINGS = {
    'ibm866': 'cp866',
    'big5': 'cp950'
};
const UTF8 = 'utf8';
export async function resolveTerminalEncoding(verbose) {
    let rawEncodingPromise;
    // Support a global environment variable to win over other mechanics
    const cliEncodingEnv = process.env['VSCODE_CLI_ENCODING'];
    if (cliEncodingEnv) {
        if (verbose) {
            console.log(`Found VSCODE_CLI_ENCODING variable: ${cliEncodingEnv}`);
        }
        rawEncodingPromise = Promise.resolve(cliEncodingEnv);
    }
    // Windows: educated guess
    else if (isWindows) {
        rawEncodingPromise = new Promise(resolve => {
            if (verbose) {
                console.log('Running "chcp" to detect terminal encoding...');
            }
            exec('chcp', (err, stdout, stderr) => {
                if (stdout) {
                    if (verbose) {
                        console.log(`Output from "chcp" command is: ${stdout}`);
                    }
                    const windowsTerminalEncodingKeys = Object.keys(windowsTerminalEncodings);
                    for (const key of windowsTerminalEncodingKeys) {
                        if (stdout.indexOf(key) >= 0) {
                            return resolve(windowsTerminalEncodings[key]);
                        }
                    }
                }
                return resolve(undefined);
            });
        });
    }
    // Linux/Mac: use "locale charmap" command
    else {
        rawEncodingPromise = new Promise(resolve => {
            if (verbose) {
                console.log('Running "locale charmap" to detect terminal encoding...');
            }
            exec('locale charmap', (err, stdout, stderr) => resolve(stdout));
        });
    }
    const rawEncoding = await rawEncodingPromise;
    if (verbose) {
        console.log(`Detected raw terminal encoding: ${rawEncoding}`);
    }
    if (!rawEncoding || rawEncoding.toLowerCase() === 'utf-8' || rawEncoding.toLowerCase() === UTF8) {
        return UTF8;
    }
    return toIconvLiteEncoding(rawEncoding);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFbmNvZGluZy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2Uvbm9kZS90ZXJtaW5hbEVuY29kaW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHOztHQUVHO0FBQ0gsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNyQyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFbEQsTUFBTSx3QkFBd0IsR0FBRztJQUNoQyxLQUFLLEVBQUUsT0FBTyxFQUFFLGdCQUFnQjtJQUNoQyxLQUFLLEVBQUUsT0FBTyxFQUFFLHdCQUF3QjtJQUN4QyxLQUFLLEVBQUUsT0FBTyxFQUFFLG1CQUFtQjtJQUNuQyxLQUFLLEVBQUUsT0FBTyxFQUFFLG9CQUFvQjtJQUNwQyxLQUFLLEVBQUUsT0FBTyxFQUFFLFVBQVU7SUFDMUIsS0FBSyxFQUFFLE9BQU8sRUFBRSxhQUFhO0lBQzdCLEtBQUssRUFBRSxPQUFPLEVBQUUsWUFBWTtJQUM1QixLQUFLLEVBQUUsT0FBTyxFQUFFLG9CQUFvQjtJQUNwQyxLQUFLLEVBQUUsT0FBTyxFQUFFLFNBQVM7SUFDekIsS0FBSyxFQUFFLE9BQU8sRUFBRSxVQUFVO0lBQzFCLEtBQUssRUFBRSxPQUFPLEVBQUUsZUFBZTtJQUMvQixLQUFLLEVBQUUsT0FBTyxFQUFFLHFCQUFxQjtJQUNyQyxNQUFNLEVBQUUsUUFBUSxDQUFDLHNCQUFzQjtDQUN2QyxDQUFDO0FBRUYsU0FBUyxtQkFBbUIsQ0FBQyxZQUFvQjtJQUNoRCxNQUFNLHNCQUFzQixHQUFHLFlBQVksQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLEVBQUUsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3ZGLE1BQU0sTUFBTSxHQUFHLDRCQUE0QixDQUFDLHNCQUFzQixDQUFDLENBQUM7SUFFcEUsT0FBTyxN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