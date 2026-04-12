/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mainWindow } from '../../../base/browser/window.js';
import { relativePath } from '../../../base/common/resources.js';
import { AdapterLogger, DEFAULT_LOG_LEVEL, LogLevel } from '../common/log.js';
/**
 * Only used in browser contexts where the log files are not stored on disk
 * but in IndexedDB. A method to get all logs with their contents so that
 * CI automation can persist them.
 */
export async function getLogs(fileService, environmentService) {
    const result = [];
    await doGetLogs(fileService, result, environmentService.logsHome, environmentService.logsHome);
    return result;
}
async function doGetLogs(fileService, logs, curFolder, logsHome) {
    const stat = await fileService.resolve(curFolder);
    for (const { resource, isDirectory } of stat.children || []) {
        if (isDirectory) {
            await doGetLogs(fileService, logs, resource, logsHome);
        }
        else {
            const contents = (await fileService.readFile(resource)).value.toString();
            if (contents) {
                const path = relativePath(logsHome, resource);
                if (path) {
                    logs.push({ relativePath: path, contents });
                }
            }
        }
    }
}
function logLevelToString(level) {
    switch (level) {
        case LogLevel.Trace: return 'trace';
        case LogLevel.Debug: return 'debug';
        case LogLevel.Info: return 'info';
        case LogLevel.Warning: return 'warn';
        case LogLevel.Error: return 'error';
    }
    return 'info';
}
/**
 * A logger that is used when VSCode is running in the web with
 * an automation such as playwright. We expect a global codeAutomationLog
 * to be defined that we can use to log to.
 */
export class ConsoleLogInAutomationLogger extends AdapterLogger {
    constructor(logLevel = DEFAULT_LOG_LEVEL) {
        super({ log: (level, args) => this.consoleLog(logLevelToString(level), args) }, logLevel);
    }
    consoleLog(type, args) {
        const automatedWindow = mainWindow;
        if (typeof automatedWindow.codeAutomationLog === 'function') {
            try {
                automatedWindow.codeAutomationLog(type, args);
            }
            catch (err) {
                // see https://github.com/microsoft/vscode-test-web/issues/69
                console.error('Problems writing to codeAutomationLog', err);
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vbG9nL2Jyb3dzZXIvbG9nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFJakUsT0FBTyxFQUFFLGFBQWEsRUFBRSxpQkFBaUIsRUFBVyxRQUFRLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQVl2Rjs7OztHQUlHO0FBQ0gsTUFBTSxDQUFDLEtBQUssVUFBVSxPQUFPLENBQUMsV0FBeUIsRUFBRSxrQkFBdUM7SUFDL0YsTUFBTSxNQUFNLEdBQWUsRUFBRSxDQUFDO0lBRTlCLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRSxNQUFNLEVBQUUsa0JBQWtCLENBQUMsUUFBUSxFQUFFLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRS9GLE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVELEtBQUssVUFBVSxTQUFTLENBQUMsV0FBeUIsRUFBRSxJQUFnQixFQUFFLFNBQWMsRUFBRSxRQUFhO0lBQ2xHLE1BQU0sSUFBSSxHQUFHLE1BQU0sV0FBVyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUVsRCxLQUFLLE1BQU0sRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxFQUFFLEVBQUUsQ0FBQztRQUM3RCxJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQ2pCLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3hELENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxRQUFRLEdBQUcsQ0FBQyxNQUFNLFdBQVcsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDekUsSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDZCxNQUFNLElBQUksR0FBRyxZQUFZLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUM5QyxJQUFJLElBQUksRUFBRSxDQUFDO29CQUNWLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBQzdDLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxLQUFlO0lBQ3hDLFFBQVEsS0FBSyxFQUFFLENBQUM7UUFDZixLQUFLLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLE9BQU8sQ0FBQztRQUNwQyxLQUFLLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLE9BQU8sQ0FBQztRQUNwQyxLQUFLLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLE1BQU0sQ0FBQztRQUNsQyxLQUFLLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLE1BQU0sQ0FBQztRQUNyQyxLQUFLLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLE9BQU8sQ0FBQztJQUNyQyxDQUFDO0lBQ0QsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILE1BQU0sT0FBTyw0QkFBNkIsU0FBUSxhQUFhO0lBSTlELFlBQVksV0FBcUIsaUJBQWlCO1FBQ2pELEtBQUssQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMzRixDQUFDO0lBRU8sVUFBVSxDQUFDLElBQVksRUFBRSxJQUFXO1FBQzNDLE1BQU0sZUFBZSxHQUFHLFVBQXlDLENBQUM7UUFDbEUsSUFBSSxPQUFPLGVBQWUsQ0FBQyxpQkFBaUIsS0FBSyxVQUFVLEVBQUUsQ0FBQztZQUM3RCxJQUFJLENBQUM7Z0JBQ0osZUFBZSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMvQyxDQUFDO1lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztnQkFDZCw2REFBNkQ7Z0JBQzdELE9BQU8sQ0FBQyxLQUFLLENBQUMsdUNBQXVDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDN0QsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0NBQ0QifQ==