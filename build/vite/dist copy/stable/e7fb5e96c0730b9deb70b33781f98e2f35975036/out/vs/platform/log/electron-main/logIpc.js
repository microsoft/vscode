/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ResourceMap } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { isLogLevel, log, LogLevel } from '../common/log.js';
export class LoggerChannel {
    constructor(loggerService) {
        this.loggerService = loggerService;
        this.loggers = new ResourceMap();
    }
    listen(_, event, windowId) {
        switch (event) {
            case 'onDidChangeLoggers': return windowId ? this.loggerService.getOnDidChangeLoggersEvent(windowId) : this.loggerService.onDidChangeLoggers;
            case 'onDidChangeLogLevel': return windowId ? this.loggerService.getOnDidChangeLogLevelEvent(windowId) : this.loggerService.onDidChangeLogLevel;
            case 'onDidChangeVisibility': return windowId ? this.loggerService.getOnDidChangeVisibilityEvent(windowId) : this.loggerService.onDidChangeVisibility;
        }
        throw new Error(`Event not found: ${event}`);
    }
    async call(_, command, arg) {
        switch (command) {
            case 'createLogger':
                this.createLogger(URI.revive(arg[0]), arg[1], arg[2]);
                return;
            case 'log': return this.log(URI.revive(arg[0]), arg[1]);
            case 'consoleLog': return this.consoleLog(arg[0], arg[1]);
            case 'setLogLevel': return isLogLevel(arg[0]) ? this.loggerService.setLogLevel(arg[0]) : this.loggerService.setLogLevel(URI.revive(arg[0]), arg[1]);
            case 'setVisibility': return this.loggerService.setVisibility(URI.revive(arg[0]), arg[1]);
            case 'registerLogger': return this.loggerService.registerLogger({ ...arg[0], resource: URI.revive(arg[0].resource) }, arg[1]);
            case 'deregisterLogger': return this.loggerService.deregisterLogger(URI.revive(arg[0]));
        }
        throw new Error(`Call not found: ${command}`);
    }
    createLogger(file, options, windowId) {
        this.loggers.set(file, this.loggerService.createLogger(file, options, windowId));
    }
    consoleLog(level, args) {
        let consoleFn = console.log;
        switch (level) {
            case LogLevel.Error:
                consoleFn = console.error;
                break;
            case LogLevel.Warning:
                consoleFn = console.warn;
                break;
            case LogLevel.Info:
                consoleFn = console.info;
                break;
        }
        consoleFn.call(console, ...args);
    }
    log(file, messages) {
        const logger = this.loggers.get(file);
        if (!logger) {
            throw new Error('Create the logger before logging');
        }
        for (const [level, message] of messages) {
            log(logger, level, message);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nSXBjLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vbG9nL2VsZWN0cm9uLW1haW4vbG9nSXBjLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFbEQsT0FBTyxFQUEyQixVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBR3RGLE1BQU0sT0FBTyxhQUFhO0lBSXpCLFlBQTZCLGFBQWlDO1FBQWpDLGtCQUFhLEdBQWIsYUFBYSxDQUFvQjtRQUY3QyxZQUFPLEdBQUcsSUFBSSxXQUFXLEVBQVcsQ0FBQztJQUVZLENBQUM7SUFFbkUsTUFBTSxDQUFDLENBQVUsRUFBRSxLQUFhLEVBQUUsUUFBaUI7UUFDbEQsUUFBUSxLQUFLLEVBQUUsQ0FBQztZQUNmLEtBQUssb0JBQW9CLENBQUMsQ0FBQyxPQUFPLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQztZQUM3SSxLQUFLLHFCQUFxQixDQUFDLENBQUMsT0FBTyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsMkJBQTJCLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsbUJBQW1CLENBQUM7WUFDaEosS0FBSyx1QkFBdUIsQ0FBQyxDQUFDLE9BQU8sUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLDZCQUE2QixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FB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