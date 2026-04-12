/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import { tmpdir } from 'os';
import { Queue } from '../../../base/common/async.js';
import { randomPath } from '../../../base/common/extpath.js';
import { resolveTerminalEncoding } from '../../../base/node/terminalEncoding.js';
export function hasStdinWithoutTty() {
    try {
        return !process.stdin.isTTY; // Via https://twitter.com/MylesBorins/status/782009479382626304
    }
    catch {
        // Windows workaround for https://github.com/nodejs/node/issues/11656
    }
    return false;
}
export function stdinDataListener(durationinMs) {
    return new Promise(resolve => {
        const dataListener = () => resolve(true);
        // wait for 1s maximum...
        setTimeout(() => {
            process.stdin.removeListener('data', dataListener);
            resolve(false);
        }, durationinMs);
        // ...but finish early if we detect data
        process.stdin.once('data', dataListener);
    });
}
export function getStdinFilePath() {
    return randomPath(tmpdir(), 'code-stdin', 3);
}
async function createStdInFile(targetPath) {
    await fs.promises.appendFile(targetPath, '');
    await fs.promises.chmod(targetPath, 0o600); // Ensure the file is only read/writable by the user: https://github.com/microsoft/vscode-remote-release/issues/9048
}
export async function readFromStdin(targetPath, verbose, onEnd) {
    let [encoding, iconv] = await Promise.all([
        resolveTerminalEncoding(verbose), // respect terminal encoding when piping into file
        import('@vscode/iconv-lite-umd'), // lazy load encoding module for usage
        createStdInFile(targetPath) // make sure file exists right away (https://github.com/microsoft/vscode/issues/155341)
    ]);
    if (!iconv.default.encodingExists(encoding)) {
        console.log(`Unsupported terminal encoding: ${encoding}, falling back to UTF-8.`);
        encoding = 'utf8';
    }
    // Use a `Queue` to be able to use `appendFile`
    // which helps file watchers to be aware of the
    // changes because each append closes the underlying
    // file descriptor.
    // (https://github.com/microsoft/vscode/issues/148952)
    const appendFileQueue = new Queue();
    const decoder = iconv.default.getDecoder(encoding);
    process.stdin.on('data', chunk => {
        const chunkStr = decoder.write(chunk);
        appendFileQueue.queue(() => fs.promises.appendFile(targetPath, chunkStr));
    });
    process.stdin.on('end', () => {
        const end = decoder.end();
        appendFileQueue.queue(async () => {
            try {
                if (typeof end === 'string') {
                    await fs.promises.appendFile(targetPath, end);
                }
            }
            finally {
                onEnd?.();
            }
        });
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RkaW4uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9lbnZpcm9ubWVudC9ub2RlL3N0ZGluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDNUIsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVqRixNQUFNLFVBQVUsa0JBQWtCO0lBQ2pDLElBQUksQ0FBQztRQUNKLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLGdFQUFnRTtJQUM5RixDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1IscUVBQXFFO0lBQ3RFLENBQUM7SUFDRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxNQUFNLFVBQVUsaUJBQWlCLENBQUMsWUFBb0I7SUFDckQsT0FBTyxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUM1QixNQUFNLFlBQVksR0FBRyxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFekMseUJBQXlCO1FBQ3pCLFVBQVUsQ0FBQyxHQUFHLEVBQUU7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFFbkQsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2hCLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUVqQix3Q0FBd0M7UUFDeEMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENB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