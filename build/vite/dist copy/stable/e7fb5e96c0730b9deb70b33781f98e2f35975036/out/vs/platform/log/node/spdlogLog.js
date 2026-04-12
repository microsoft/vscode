/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ByteSize } from '../../files/common/files.js';
import { AbstractMessageLogger, LogLevel } from '../common/log.js';
var SpdLogLevel;
(function (SpdLogLevel) {
    SpdLogLevel[SpdLogLevel["Trace"] = 0] = "Trace";
    SpdLogLevel[SpdLogLevel["Debug"] = 1] = "Debug";
    SpdLogLevel[SpdLogLevel["Info"] = 2] = "Info";
    SpdLogLevel[SpdLogLevel["Warning"] = 3] = "Warning";
    SpdLogLevel[SpdLogLevel["Error"] = 4] = "Error";
    SpdLogLevel[SpdLogLevel["Critical"] = 5] = "Critical";
    SpdLogLevel[SpdLogLevel["Off"] = 6] = "Off";
})(SpdLogLevel || (SpdLogLevel = {}));
async function createSpdLogLogger(name, logfilePath, filesize, filecount, donotUseFormatters) {
    // Do not crash if spdlog cannot be loaded
    try {
        const _spdlog = await import('@vscode/spdlog');
        _spdlog.setFlushOn(SpdLogLevel.Trace);
        const logger = await _spdlog.createAsyncRotatingLogger(name, logfilePath, filesize, filecount);
        if (donotUseFormatters) {
            logger.clearFormatters();
        }
        else {
            logger.setPattern('%Y-%m-%d %H:%M:%S.%e [%l] %v');
        }
        return logger;
    }
    catch (e) {
        console.error(e);
    }
    return null;
}
function log(logger, level, message) {
    switch (level) {
        case LogLevel.Trace:
            logger.trace(message);
            break;
        case LogLevel.Debug:
            logger.debug(message);
            break;
        case LogLevel.Info:
            logger.info(message);
            break;
        case LogLevel.Warning:
            logger.warn(message);
            break;
        case LogLevel.Error:
            logger.error(message);
            break;
        case LogLevel.Off: /* do nothing */ break;
        default: throw new Error(`Invalid log level ${level}`);
    }
}
function setLogLevel(logger, level) {
    switch (level) {
        case LogLevel.Trace:
            logger.setLevel(SpdLogLevel.Trace);
            break;
        case LogLevel.Debug:
            logger.setLevel(SpdLogLevel.Debug);
            break;
        case LogLevel.Info:
            logger.setLevel(SpdLogLevel.Info);
            break;
        case LogLevel.Warning:
            logger.setLevel(SpdLogLevel.Warning);
            break;
        case LogLevel.Error:
            logger.setLevel(SpdLogLevel.Error);
            break;
        case LogLevel.Off:
            logger.setLevel(SpdLogLevel.Off);
            break;
        default: throw new Error(`Invalid log level ${level}`);
    }
}
export class SpdLogLogger extends AbstractMessageLogger {
    constructor(name, filepath, rotating, donotUseFormatters, level) {
        super();
        this.buffer = [];
        this.setLevel(level);
        this._loggerCreationPromise = this._createSpdLogLogger(name, filepath, rotating, donotUseFormatters);
        this._register(this.onDidChangeLogLevel(level => {
            if (this._logger) {
                setLogLevel(this._logger, level);
            }
        }));
    }
    async _createSpdLogLogger(name, filepath, rotating, donotUseFormatters) {
        const filecount = rotating ? 6 : 1;
        const filesize = (30 / filecount) * ByteSize.MB;
        const logger = await createSpdLogLogger(name, filepath, filesize, filecount, donotUseFormatters);
        if (logger) {
            this._logger = logger;
            setLogLevel(this._logger, this.getLevel());
            for (const { level, message } of this.buffer) {
                log(this._logger, level, message);
            }
            this.buffer = [];
        }
    }
    log(level, message) {
        if (this._logger) {
            log(this._logger, level, message);
        }
        else if (this.getLevel() <= level) {
            this.buffer.push({ level, message });
        }
    }
    flush() {
        if (this._logger) {
            this.flushLogger();
        }
        else {
            this._loggerCreationPromise.then(() => this.flushLogger());
        }
    }
    dispose() {
        if (this._logger) {
            this.disposeLogger();
        }
        else {
            this._loggerCreationPromise.then(() => this.disposeLogger());
        }
        super.dispose();
    }
    flushLogger() {
        if (this._logger) {
            this._logger.flush();
        }
    }
    disposeLogger() {
        if (this._logger) {
            this._logger.drop();
            this._logger = undefined;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3BkbG9nTG9nLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vbG9nL25vZGUvc3BkbG9nTG9nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RCxPQUFPLEVBQUUscUJBQXFCLEVBQVcsUUFBUSxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFFNUUsSUFBSyxXQVFKO0FBUkQsV0FBSyxXQUFXO0lBQ2YsK0NBQUssQ0FBQTtJQUNMLCtDQUFLLENBQUE7SUFDTCw2Q0FBSSxDQUFBO0lBQ0osbURBQU8sQ0FBQTtJQUNQLCtDQUFLLENBQUE7SUFDTCxxREFBUSxDQUFBO0lBQ1IsMkNBQUcsQ0FBQTtBQUNKLENBQUMsRUFSSSxXQUFXLEtBQVgsV0FBVyxRQVFmO0FBRUQsS0FBSyxVQUFVLGtCQUFrQixDQUFDLElBQVksRUFBRSxXQUFtQixFQUFFLFFBQWdCLEVBQUUsU0FBaUIsRUFBRSxrQkFBMkI7SUFDcEksMENBQTBDO0lBQzFDLElBQUksQ0FBQztRQUNKLE1BQU0sT0FBTyxHQUFHLE1BQU0sTUFBTSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDL0MsT0FBTyxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdEMsTUFBTSxNQUFNLEdBQUcsTUFBTSxPQUFPLENBQUMseUJBQXlCLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDL0YsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1lBQ3hCLE1BQU0sQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUMxQixDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sQ0FBQyxVQUFVLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUNuRCxDQUFDO1FBQ0QsT0FBTyxNQUFN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