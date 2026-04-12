"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.fromNow = fromNow;
const vscode_1 = require("vscode");
const minute = 60;
const hour = minute * 60;
const day = hour * 24;
const week = day * 7;
const month = day * 30;
const year = day * 365;
/**
 * Create a localized of the time between now and the specified date.
 * @param date The date to generate the difference from.
 * @param appendAgoLabel Whether to append the " ago" to the end.
 * @param useFullTimeWords Whether to use full words (eg. seconds) instead of
 * shortened (eg. secs).
 * @param disallowNow Whether to disallow the string "now" when the difference
 * is less than 30 seconds.
 */
function fromNow(date, appendAgoLabel, useFullTimeWords, disallowNow) {
    if (typeof date !== 'number') {
        date = date.getTime();
    }
    const seconds = Math.round((new Date().getTime() - date) / 1000);
    if (seconds < -30) {
        return vscode_1.l10n.t('in {0}', fromNow(new Date().getTime() + seconds * 1000, false));
    }
    if (!disallowNow && seconds < 30) {
        return vscode_1.l10n.t('now');
    }
    let value;
    if (seconds < minute) {
        value = seconds;
        if (appendAgoLabel) {
            if (value === 1) {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} second ago', value)
                    : vscode_1.l10n.t('{0} sec ago', value);
            }
            else {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} seconds ago', value)
                    : vscode_1.l10n.t('{0} secs ago', value);
            }
        }
        else {
            if (value === 1) {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} second', value)
                    : vscode_1.l10n.t('{0} sec', value);
            }
            else {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} seconds', value)
                    : vscode_1.l10n.t('{0} secs', value);
            }
        }
    }
    if (seconds < hour) {
        value = Math.floor(seconds / minute);
        if (appendAgoLabel) {
            if (value === 1) {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} minute ago', value)
                    : vscode_1.l10n.t('{0} min ago', value);
            }
            else {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} minutes ago', value)
                    : vscode_1.l10n.t('{0} mins ago', value);
            }
        }
        else {
            if (value === 1) {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} minute', value)
                    : vscode_1.l10n.t('{0} min', value);
            }
            else {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} minutes', value)
                    : vscode_1.l10n.t('{0} mins', value);
            }
        }
    }
    if (seconds < day) {
        value = Math.floor(seconds / hour);
        if (appendAgoLabel) {
            if (value === 1) {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} hour ago', value)
                    : vscode_1.l10n.t('{0} hr ago', value);
            }
            else {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} hours ago', value)
                    : vscode_1.l10n.t('{0} hrs ago', value);
            }
        }
        else {
            if (value === 1) {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} hour', value)
                    : vscode_1.l10n.t('{0} hr', value);
            }
            else {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} hours', value)
                    : vscode_1.l10n.t('{0} hrs', value);
            }
        }
    }
    if (seconds < week) {
        value = Math.floor(seconds / day);
        if (appendAgoLabel) {
            return value === 1
                ? vscode_1.l10n.t('{0} day ago', value)
                : vscode_1.l10n.t('{0} days ago', value);
        }
        else {
            return value === 1
                ? vscode_1.l10n.t('{0} day', value)
                : vscode_1.l10n.t('{0} days', value);
        }
    }
    if (seconds < month) {
        value = Math.floor(seconds / week);
        if (appendAgoLabel) {
            if (value === 1) {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} week ago', value)
                    : vscode_1.l10n.t('{0} wk ago', value);
            }
            else {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} weeks ago', value)
                    : vscode_1.l10n.t('{0} wks ago', value);
            }
        }
        else {
            if (value === 1) {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} week', value)
                    : vscode_1.l10n.t('{0} wk', value);
            }
            else {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} weeks', value)
                    : vscode_1.l10n.t('{0} wks', value);
            }
        }
    }
    if (seconds < year) {
        value = Math.floor(seconds / month);
        if (appendAgoLabel) {
            if (value === 1) {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} month ago', value)
                    : vscode_1.l10n.t('{0} mo ago', value);
            }
            else {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} months ago', value)
                    : vscode_1.l10n.t('{0} mos ago', value);
            }
        }
        else {
            if (value === 1) {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} month', value)
                    : vscode_1.l10n.t('{0} mo', value);
            }
            else {
                return useFullTimeWords
                    ? vscode_1.l10n.t('{0} months', value)
                    : vscode_1.l10n.t('{0} mos', value);
            }
        }
    }
    value = Math.floor(seconds / year);
    if (appendAgoLabel) {
        if (value === 1) {
            return useFullTimeWords
                ? vscode_1.l10n.t('{0} year ago', value)
                : vscode_1.l10n.t('{0} yr ago', value);
        }
        else {
            return useFullTimeWords
                ? vscode_1.l10n.t('{0} years ago', value)
                : vscode_1.l10n.t('{0} yrs ago', value);
        }
    }
    else {
        if (value === 1) {
            return useFullTimeWords
                ? vscode_1.l10n.t('{0} year', value)
                : vscode_1.l10n.t('{0} yr', value);
        }
        else {
            return useFullTimeWords
                ? vscode_1.l10n.t('{0} years', value)
                : vscode_1.l10n.t('{0} yrs', value);
        }
    }
}
//# sourceMappingURL=date.js.map