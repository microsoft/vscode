"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.LogLevel = void 0;
exports.parseLogLevel = parseLogLevel;
/**
 * Matches the ts.server.LogLevel enum
 */
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["terse"] = 0] = "terse";
    LogLevel[LogLevel["normal"] = 1] = "normal";
    LogLevel[LogLevel["requestTime"] = 2] = "requestTime";
    LogLevel[LogLevel["verbose"] = 3] = "verbose";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    tsLogger;
    constructor(logLevel) {
        const doLog = typeof logLevel === 'undefined'
            ? (_message) => { }
            : (message) => { postMessage({ type: 'log', body: message }); };
        this.tsLogger = {
            close: () => { },
            hasLevel: level => typeof logLevel === 'undefined' ? false : level <= logLevel,
            loggingEnabled: () => true,
            perftrc: () => { },
            info: doLog,
            msg: doLog,
            startGroup: () => { },
            endGroup: () => { },
            getLogFileName: () => undefined
        };
    }
    log(level, message, data) {
        if (this.tsLogger.hasLevel(level)) {
            this.tsLogger.info(message + (data ? ' ' + JSON.stringify(data) : ''));
        }
    }
    logNormal(message, data) {
        this.log(LogLevel.normal, message, data);
    }
    logVerbose(message, data) {
        this.log(LogLevel.verbose, message, data);
    }
}
exports.Logger = Logger;
function parseLogLevel(input) {
    switch (input) {
        case 'normal': return LogLevel.normal;
        case 'terse': return LogLevel.terse;
        case 'verbose': return LogLevel.verbose;
        default: return undefined;
    }
}
//# sourceMappingURL=logging.js.map