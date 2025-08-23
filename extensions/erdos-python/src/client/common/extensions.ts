// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare interface String {
    /**
     * Appropriately formats a string so it can be used as an argument for a command in a shell.
     * E.g. if an argument contains a space, then it will be enclosed within double quotes.
     */
    toCommandArgumentForPythonExt(): string;
    /**
     * Appropriately formats a a file path so it can be used as an argument for a command in a shell.
     * E.g. if an argument contains a space, then it will be enclosed within double quotes.
     */
    fileToCommandArgumentForPythonExt(): string;
    /**
     * String.format() implementation.
     * Tokens such as {0}, {1} will be replaced with corresponding positional arguments.
     */
    format(...args: string[]): string;

    /**
     * String.trimQuotes implementation
     * Removes leading and trailing quotes from a string
     */
    trimQuotes(): string;
}

/**
 * Appropriately formats a string so it can be used as an argument for a command in a shell.
 * E.g. if an argument contains a space, then it will be enclosed within double quotes.
 */
String.prototype.toCommandArgumentForPythonExt = function (this: string): string {
    if (!this) {
        return this;
    }
    return (this.indexOf(' ') >= 0 || this.indexOf('&') >= 0 || this.indexOf('(') >= 0 || this.indexOf(')') >= 0) &&
        !this.startsWith('"') &&
        !this.endsWith('"')
        ? `"${this}"`
        : this.toString();
};

/**
 * Appropriately formats a a file path so it can be used as an argument for a command in a shell.
 * E.g. if an argument contains a space, then it will be enclosed within double quotes.
 */
String.prototype.fileToCommandArgumentForPythonExt = function (this: string): string {
    if (!this) {
        return this;
    }
    return this.toCommandArgumentForPythonExt().replace(/\\/g, '/');
};

/**
 * String.trimQuotes implementation
 * Removes leading and trailing quotes from a string
 */
String.prototype.trimQuotes = function (this: string): string {
    if (!this) {
        return this;
    }
    return this.replace(/(^['"])|(['"]$)/g, '');
};

/**
 * Explicitly tells that promise should be run asynchonously.
 */
Promise.prototype.ignoreErrors = function <T>(this: Promise<T>) {
    return this.catch(() => {});
};

if (!String.prototype.format) {
    String.prototype.format = function (this: string) {
        const args = arguments;
        return this.replace(/{(\d+)}/g, (match, number) => (args[number] === undefined ? match : args[number]));
    };
}
