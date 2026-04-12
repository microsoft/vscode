/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
let globalObservableLogger;
export function addLogger(logger) {
    if (!globalObservableLogger) {
        globalObservableLogger = logger;
    }
    else if (globalObservableLogger instanceof ComposedLogger) {
        globalObservableLogger.loggers.push(logger);
    }
    else {
        globalObservableLogger = new ComposedLogger([globalObservableLogger, logger]);
    }
}
export function getLogger() {
    return globalObservableLogger;
}
let globalObservableLoggerFn = undefined;
export function setLogObservableFn(fn) {
    globalObservableLoggerFn = fn;
}
export function logObservable(obs) {
    if (globalObservableLoggerFn) {
        globalObservableLoggerFn(obs);
    }
}
class ComposedLogger {
    constructor(loggers) {
        this.loggers = loggers;
    }
    handleObservableCreated(observable, location) {
        for (const logger of this.loggers) {
            logger.handleObservableCreated(observable, location);
        }
    }
    handleOnListenerCountChanged(observable, newCount) {
        for (const logger of this.loggers) {
            logger.handleOnListenerCountChanged(observable, newCount);
        }
    }
    handleObservableUpdated(observable, info) {
        for (const logger of this.loggers) {
            logger.handleObservableUpdated(observable, info);
        }
    }
    handleAutorunCreated(autorun, location) {
        for (const logger of this.loggers) {
            logger.handleAutorunCreated(autorun, location);
        }
    }
    handleAutorunDisposed(autorun) {
        for (const logger of this.loggers) {
            logger.handleAutorunDisposed(autorun);
        }
    }
    handleAutorunDependencyChanged(autorun, observable, change) {
        for (const logger of this.loggers) {
            logger.handleAutorunDependencyChanged(autorun, observable, change);
        }
    }
    handleAutorunStarted(autorun) {
        for (const logger of this.loggers) {
            logger.handleAutorunStarted(autorun);
        }
    }
    handleAutorunFinished(autorun) {
        for (const logger of this.loggers) {
            logger.handleAutorunFinished(autorun);
        }
    }
    handleDerivedDependencyChanged(derived, observable, change) {
        for (const logger of this.loggers) {
            logger.handleDerivedDependencyChanged(derived, observable, change);
        }
    }
    handleDerivedCleared(observable) {
        for (const logger of this.loggers) {
            logger.handleDerivedCleared(observable);
        }
    }
    handleBeginTransaction(transaction) {
        for (const logger of this.loggers) {
            logger.handleBeginTransaction(transaction);
        }
    }
    handleEndTransaction(transaction) {
        for (const logger of this.loggers) {
            logger.handleEndTransaction(transaction);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nZ2luZy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC9sb2dnaW5nL2xvZ2dpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFRaEcsSUFBSSxzQkFBcUQsQ0FBQztBQUUxRCxNQUFNLFVBQVUsU0FBUyxDQUFDLE1BQXlCO0lBQ2xELElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBQzdCLHNCQUFzQixHQUFHLE1BQU0sQ0FBQztJQUNqQyxDQUFDO1NBQU0sSUFBSSxzQkFBc0IsWUFBWSxjQUFjLEVBQUUsQ0FBQztRQUM3RCxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzdDLENBQUM7U0FBTSxDQUFDO1FBQ1Asc0JBQXNCLEdBQUcsSUFBSSxjQUFjLENBQUMsQ0FBQyxzQkFBc0IsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQy9FLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxVQUFVLFNBQVM7SUFDeEIsT0FBTyxzQkFBc0IsQ0FBQztBQUMvQixDQUFDO0FBRUQsSUFBSSx3QkFBd0IsR0FBa0QsU0FBUyxDQUFDO0FBQ3hGLE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxFQUFtQztJQUNyRSx3QkFBd0IsR0FBRyxFQUFFLENBQUM7QUFDL0IsQ0FBQztBQUVELE1BQU0sVUFBVSxhQUFhLENBQUMsR0FBcUI7SUFDbEQsSUFBSSx3QkFBd0IsRUFBRSxDQUFDO1FBQzlCLHdCQUF3QixDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQy9CLENBQUM7QUFDRixDQUFDO0FBNkJELE1BQU0sY0FBYztJQUNuQixZQUNpQixPQUE0QjtRQUE1QixZQUFPLEdBQVAsT0FBTyxDQUFxQjtJQUN6QyxDQUFDO0lBRUwsdUJBQXVCLENBQUMsVUFBNEIsRUFBRSxRQUF1QjtR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