/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../nls.js';
import { Lazy } from './lazy.js';
import { LANGUAGE_DEFAULT } from './platform.js';
const minute = 60;
const hour = minute * 60;
const day = hour * 24;
const week = day * 7;
const month = day * 30;
const year = day * 365;
/**
 * Create a localized difference of the time between now and the specified date.
 * @param date The date to generate the difference from.
 * @param appendAgoLabel Whether to append the " ago" to the end.
 * @param useFullTimeWords Whether to use full words (eg. seconds) instead of
 * shortened (eg. secs).
 * @param disallowNow Whether to disallow the string "now" when the difference
 * is less than 30 seconds.
 */
export function fromNow(date, appendAgoLabel, useFullTimeWords, disallowNow) {
    if (typeof date === 'undefined') {
        return localize('date.fromNow.unknown', 'unknown');
    }
    if (typeof date !== 'number') {
        date = date.getTime();
    }
    const seconds = Math.round((new Date().getTime() - date) / 1000);
    if (seconds < -30) {
        return localize('date.fromNow.in', 'in {0}', fromNow(new Date().getTime() + seconds * 1000, false));
    }
    if (!disallowNow && seconds < 30) {
        return localize('date.fromNow.now', 'now');
    }
    let value;
    if (seconds < minute) {
        value = seconds;
        if (appendAgoLabel) {
            if (value === 1) {
                return useFullTimeWords
                    ? localize('date.fromNow.seconds.singular.ago.fullWord', '{0} second ago', value)
                    : localize('date.fromNow.seconds.singular.ago', '{0} sec ago', value);
            }
            else {
                return useFullTimeWords
                    ? localize('date.fromNow.seconds.plural.ago.fullWord', '{0} seconds ago', value)
                    : localize('date.fromNow.seconds.plural.ago', '{0} secs ago', value);
            }
        }
        else {
            if (value === 1) {
                return useFullTimeWords
                    ? localize('date.fromNow.seconds.singular.fullWord', '{0} second', value)
                    : localize('date.fromNow.seconds.singular', '{0} sec', value);
            }
            else {
                return useFullTimeWords
                    ? localize('date.fromNow.seconds.plural.fullWord', '{0} seconds', value)
                    : localize('date.fromNow.seconds.plural', '{0} secs', value);
            }
        }
    }
    if (seconds < hour) {
        value = Math.round(seconds / minute);
        if (appendAgoLabel) {
            if (value === 1) {
                return useFullTimeWords
                    ? localize('date.fromNow.minutes.singular.ago.fullWord', '{0} minute ago', value)
                    : localize('date.fromNow.minutes.singular.ago', '{0} min ago', value);
            }
            else {
                return useFullTimeWords
                    ? localize('date.fromNow.minutes.plural.ago.fullWord', '{0} minutes ago', value)
                    : localize('date.fromNow.minutes.plural.ago', '{0} mins ago', value);
            }
        }
        else {
            if (value === 1) {
                return useFullTimeWords
                    ? localize('date.fromNow.minutes.singular.fullWord', '{0} minute', value)
                    : localize('date.fromNow.minutes.singular', '{0} min', value);
            }
            else {
                return useFullTimeWords
                    ? localize('date.fromNow.minutes.plural.fullWord', '{0} minutes', value)
                    : localize('date.fromNow.minutes.plural', '{0} mins', value);
            }
        }
    }
    if (seconds < day) {
        value = Math.round(seconds / hour);
        if (appendAgoLabel) {
            if (value === 1) {
                return useFullTimeWords
                    ? localize('date.fromNow.hours.singular.ago.fullWord', '{0} hour ago', value)
                    : localize('date.fromNow.hours.singular.ago', '{0} hr ago', value);
            }
            else {
                return useFullTimeWords
                    ? localize('date.fromNow.hours.plural.ago.fullWord', '{0} hours ago', value)
                    : localize('date.fromNow.hours.plural.ago', '{0} hrs ago', value);
            }
        }
        else {
            if (value === 1) {
                return useFullTimeWords
                    ? localize('date.fromNow.hours.singular.fullWord', '{0} hour', value)
                    : localize('date.fromNow.hours.singular', '{0} hr', value);
            }
            else {
                return useFullTimeWords
                    ? localize('date.fromNow.hours.plural.fullWord', '{0} hours', value)
                    : localize('date.fromNow.hours.plural', '{0} hrs', value);
            }
        }
    }
    if (seconds < week) {
        value = Math.round(seconds / day);
        if (appendAgoLabel) {
            return value === 1
                ? localize('date.fromNow.days.singular.ago', '{0} day ago', value)
                : localize('date.fromNow.days.plural.ago', '{0} days ago', value);
        }
        else {
            return value === 1
                ? localize('date.fromNow.days.singular', '{0} day', value)
                : localize('date.fromNow.days.plural', '{0} days', value);
        }
    }
    if (seconds < month) {
        value = Math.round(seconds / week);
        if (appendAgoLabel) {
            if (value === 1) {
                return useFullTimeWords
                    ? localize('date.fromNow.weeks.singular.ago.fullWord', '{0} week ago', value)
                    : localize('date.fromNow.weeks.singular.ago', '{0} wk ago', value);
            }
            else {
                return useFullTimeWords
                    ? localize('date.fromNow.weeks.plural.ago.fullWord', '{0} weeks ago', value)
                    : localize('date.fromNow.weeks.plural.ago', '{0} wks ago', value);
            }
        }
        else {
            if (value === 1) {
                return useFullTimeWords
                    ? localize('date.fromNow.weeks.singular.fullWord', '{0} week', value)
                    : localize('date.fromNow.weeks.singular', '{0} wk', value);
            }
            else {
                return useFullTimeWords
                    ? localize('date.fromNow.weeks.plural.fullWord', '{0} weeks', value)
                    : localize('date.fromNow.weeks.plural', '{0} wks', value);
            }
        }
    }
    if (seconds < year) {
        value = Math.round(seconds / month);
        if (appendAgoLabel) {
            if (value === 1) {
                return useFullTimeWords
                    ? localize('date.fromNow.months.singular.ago.fullWord', '{0} month ago', value)
                    : localize('date.fromNow.months.singular.ago', '{0} mo ago', value);
            }
            else {
                return useFullTimeWords
                    ? localize('date.fromNow.months.plural.ago.fullWord', '{0} months ago', value)
                    : localize('date.fromNow.months.plural.ago', '{0} mos ago', value);
            }
        }
        else {
            if (value === 1) {
                return useFullTimeWords
                    ? localize('date.fromNow.months.singular.fullWord', '{0} month', value)
                    : localize('date.fromNow.months.singular', '{0} mo', value);
            }
            else {
                return useFullTimeWords
                    ? localize('date.fromNow.months.plural.fullWord', '{0} months', value)
                    : localize('date.fromNow.months.plural', '{0} mos', value);
            }
        }
    }
    value = Math.round(seconds / year);
    if (appendAgoLabel) {
        if (value === 1) {
            return useFullTimeWords
                ? localize('date.fromNow.years.singular.ago.fullWord', '{0} year ago', value)
                : localize('date.fromNow.years.singular.ago', '{0} yr ago', value);
        }
        else {
            return useFullTimeWords
                ? localize('date.fromNow.years.plural.ago.fullWord', '{0} years ago', value)
                : localize('date.fromNow.years.plural.ago', '{0} yrs ago', value);
        }
    }
    else {
        if (value === 1) {
            return useFullTimeWords
                ? localize('date.fromNow.years.singular.fullWord', '{0} year', value)
                : localize('date.fromNow.years.singular', '{0} yr', value);
        }
        else {
            return useFullTimeWords
                ? localize('date.fromNow.years.plural.fullWord', '{0} years', value)
                : localize('date.fromNow.years.plural', '{0} yrs', value);
        }
    }
}
export function fromNowByDay(date, appendAgoLabel, useFullTimeWords) {
    if (typeof date !== 'number') {
        date = date.getTime();
    }
    const todayMidnightTime = new Date();
    todayMidnightTime.setHours(0, 0, 0, 0);
    const yesterdayMidnightTime = new Date(todayMidnightTime.getTime());
    yesterdayMidnightTime.setDate(yesterdayMidnightTime.getDate() - 1);
    if (date > todayMidnightTime.getTime()) {
        return localize('today', 'Today');
    }
    if (date > yesterdayMidnightTime.getTime()) {
        return localize('yesterday', 'Yesterday');
    }
    return fromNow(date, appendAgoLabel, useFullTimeWords);
}
/**
 * Gets a readable duration with intelligent/lossy precision. For example "40ms" or "3.040s")
 * @param ms The duration to get in milliseconds.
 * @param useFullTimeWords Whether to use full words (eg. seconds) instead of
 * shortened (eg. secs).
 */
export function getDurationString(ms, useFullTimeWords) {
    const seconds = Math.abs(ms / 1000);
    if (seconds < 1) {
        return useFullTimeWords
            ? localize('duration.ms.full', '{0} milliseconds', ms)
            : localize('duration.ms', '{0}ms', ms);
    }
    if (seconds < minute) {
        return useFullTimeWords
            ? localize('duration.s.full', '{0} seconds', Math.round(ms) / 1000)
            : localize('duration.s', '{0}s', Math.round(ms) / 1000);
    }
    if (seconds < hour) {
        return useFullTimeWords
            ? localize('duration.m.full', '{0} minutes', Math.round(ms / (1000 * minute)))
            : localize('duration.m', '{0} mins', Math.round(ms / (1000 * minute)));
    }
    if (seconds < day) {
        return useFullTimeWords
            ? localize('duration.h.full', '{0} hours', Math.round(ms / (1000 * hour)))
            : localize('duration.h', '{0} hrs', Math.round(ms / (1000 * hour)));
    }
    return localize('duration.d', '{0} days', Math.round(ms / (1000 * day)));
}
export function toLocalISOString(date) {
    return date.getFullYear() +
        '-' + String(date.getMonth() + 1).padStart(2, '0') +
        '-' + String(date.getDate()).padStart(2, '0') +
        'T' + String(date.getHours()).padStart(2, '0') +
        ':' + String(date.getMinutes()).padStart(2, '0') +
        ':' + String(date.getSeconds()).padStart(2, '0') +
        '.' + (date.getMilliseconds() / 1000).toFixed(3).slice(2, 5) +
        'Z';
}
export const safeIntl = {
    DateTimeFormat(locales, options) {
        return new Lazy(() => {
            try {
                return new Intl.DateTimeFormat(locales, options);
            }
            catch {
                return new Intl.DateTimeFormat(undefined, options);
            }
        });
    },
    Collator(locales, options) {
        return new Lazy(() => {
            try {
                return new Intl.Collator(locales, options);
            }
            catch {
                return new Intl.Collator(undefined, options);
            }
        });
    },
    Segmenter(locales, options) {
        return new Lazy(() => {
            try {
                return new Intl.Segmenter(locales, options);
            }
            catch {
                return new Intl.Segmenter(undefined, options);
            }
        });
    },
    Locale(tag, options) {
        return new Lazy(() => {
            try {
                return new Intl.Locale(tag, options);
            }
            catch {
                return new Intl.Locale(LANGUAGE_DEFAULT, options);
            }
        });
    },
    NumberFormat(locales, options) {
        return new Lazy(() => {
            try {
                return new Intl.NumberFormat(locales, options);
            }
            catch {
                return new Intl.NumberFormat(undefined, options);
            }
        });
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0ZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUN4QyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQ2pDLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUVqRCxNQUFNLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFDbEIsTUFBTSxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUUsQ0FBQztBQUN6QixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQ3RCLE1BQU0sSUFBSSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDckIsTUFBTSxLQUFLLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUN2QixNQUFNLElBQUksR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBRXZCOzs7Ozs7OztHQVFHO0FBQ0gsTUFBTSxVQUFVLE9BQU8sQ0FBQyxJQUFtQixFQUFFLGNBQXdCLEVBQUUsZ0JBQTBCLEVBQUUsV0FBcUI7SUFDdkgsSUFBSSxPQUFPLElBQUksS0FBSyxXQUFXLEVBQUUsQ0FBQztRQUNqQyxPQUFPLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRUQsSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUM5QixJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztJQUNqRSxJQUFJLE9BQU8sR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ25CLE9BQU8sUUFBUSxDQUFDLGlCQUFpQixFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxPQUFPLEdBQUcsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDckcsQ0FBQztJQUVELElBQUksQ0FBQyxXQUFXLElBQUksT0FBTyxHQUFHLEVBQUUsRUFBRSxDQUFDO1FBQ2xDLE9BQU8sUUFBUSxDQUFDLGtCQUFrQixFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCxJQUFJLEtBQWEsQ0FBQztJQUNsQixJQUFJLE9BQU8sR0FBRyxNQUFNLEVBQUUsQ0FBQztRQUN0QixLQUFLLEdBQUcsT0FBTyxDQUFDO1FBRWhCLElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEIsSUFBSSxLQUFLLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2pCLE9BQU8sZ0JBQWdCO29CQUN0QixDQUFDLENBQUMsUUFBUSxDQUFDLDRDQUE0QyxFQUFFLGdCQUFnQixFQUFFLEtBQUssQ0FBQztvQkFDakYsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxtQ0FBbUMsRUFBRSxhQUFhLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDeEUsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU8sZ0JBQWdCO29CQUN0QixDQUFDLENBQUMsUUFBUSxDQUFDLDBDQUEwQyxFQUFFLGlCQUFpQixFQUFFLEtBQUssQ0FBQztvQkFDaEYsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdkUsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxLQUFLLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2pCLE9BQU8sZ0JBQWdCO29CQUN0QixDQUFDLENBQUMsUUFBUSxDQUFDLHdDQUF3QyxFQUFFLFlBQVksRUFBRSxLQUFLLENBQUM7b0JBQ3pFLENBQUMsQ0FBQyxRQUFRLENBQUMsK0JBQStCLEVBQUUsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2hFLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLGdCQUFnQjtvQkFDdEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxzQ0FBc0MsRUFBRSxhQUFhLEVBQUUsS0FBSyxDQUFDO29CQUN4RSxDQUFDLENBQUMsUUFBUSxDQUFDLDZCQUE2QixFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMvRCxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJLE9BQU8sR0FBRyxJQUFJLEVBQUUsQ0FBQztRQUNwQixLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDLENBQUM7UUFDckMsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUNwQixJQUFJLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDakIsT0FBTyxnQkFBZ0I7b0JBQ3RCLENBQUMsQ0FBQyxRQUFRLENBQUMsNENBQTRDLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDO29CQUNqRixDQUFDLENBQUMsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLGFBQWEsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN4RSxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsT0FBTyxnQkFBZ0I7b0JBQ3RCLENBQUMsQ0FBQyxRQUFRLENBQUMsMENBQTBDLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxDQUFDO29CQUNoRixDQUFDLENBQUMsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN2RSxDQUFDO1FBQ0YsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDakIsT0FBTyxnQkFBZ0I7b0JBQ3RCLENBQUMsQ0FBQyxRQUFRLENBQUMsd0NBQXdDLEVBQUUsWUFBWSxFQUFFLEtBQUssQ0FBQztvQkFDekUsQ0FBQyxDQUFDLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDaEUsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU8sZ0JBQWdCO29CQUN0QixDQUFDLENBQUMsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLGFBQWEsRUFBRSxLQUFLLENBQUM7b0JBQ3hFLENBQUMsQ0FBQyxRQUFRLENBQUMsNkJBQTZCLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQy9ELENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksT0FBTyxHQUFHLEdBQUcsRUFBRSxDQUFDO1FBQ25CLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsQ0FBQztRQUNuQyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3BCLElBQUksS0FBSyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNqQixPQUFPLGdCQUFnQjtvQkFDdEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQywwQ0FBMEMsRUFBRSxjQUFjLEVBQUUsS0FBSyxDQUFDO29CQUM3RSxDQUFDLENBQUMsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNyRSxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsT0FBTyxnQkFBZ0I7b0JBQ3RCLENBQUMsQ0FBQyxRQUFRLENBQUMsd0NBQXdDLEVBQUUsZUFBZSxFQUFFLEtBQUssQ0FBQztvQkFDNUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxhQUFhLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDcEUsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxLQUFLLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2pCLE9BQU8sZ0JBQWdCO29CQUN0QixDQUFDLENBQUMsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUM7b0JBQ3JFLENBQUMsQ0FBQyxRQUFRLENBQUMsNkJBQTZCLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzdELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLGdCQUFnQjtvQkFDdEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxvQ0FBb0MsRUFBRSxXQUFXLEVBQUUsS0FBSyxDQUFDO29CQUNwRSxDQUFDLENBQUMsUUFBUSxDQUFDLDJCQUEyQixFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM1RCxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJLE9BQU8sR0FBRyxJQUFJLEVBQUUsQ0FBQztRQUNwQixLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFDbEMsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUNwQixPQUFPLEtBQUssS0FBSyxDQUFDO2dCQUNqQixDQUFDLENBQUMsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLGFBQWEsRUFBRSxLQUFLLENBQUM7Z0JBQ2xFLENBQUMsQ0FBQyxRQUFRLENBQUMsOEJBQThCLEVBQUUsY0FBYyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BFLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxLQUFLLEtBQUssQ0FBQztnQkFDakIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDO2dCQUMxRCxDQUFDLENBQUMsUUFBUSxDQUFDLDBCQUEwQixFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1RCxDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO1FBQ3JCLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsQ0FBQztRQUNuQyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3BCLElBQUksS0FBSyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNqQixPQUFPLGdCQUFnQjtvQkFDdEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQywwQ0FBMEMsRUFBRSxjQUFjLEVBQUUsS0FBSyxDQUFDO29CQUM3RSxDQUFDLENBQUMsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNyRSxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsT0FBTyxnQkFBZ0I7b0JBQ3RCLENBQUMsQ0FBQyxRQUFRLENBQUMsd0NBQXdDLEVBQUUsZUFBZSxFQUFFLEtBQUssQ0FBQztvQkFDNUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxhQUFhLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDcEUsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxLQUFLLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2pCLE9BQU8sZ0JBQWdCO29CQUN0QixDQUFDLENBQUMsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUM7b0JBQ3JFLENBQUMsQ0FBQyxRQUFRLENBQUMsNkJBQTZCLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzdELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLGdCQUFnQjtvQkFDdEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxvQ0FBb0MsRUFBRSxXQUFXLEVBQUUsS0FBSyxDQUFDO29CQUNwRSxDQUFDLENBQUMsUUFBUSxDQUFDLDJCQUEyQixFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM1RCxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJLE9BQU8sR0FBRyxJQUFJLEVBQUUsQ0FBQztRQUNwQixLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLENBQUM7UUFDcEMsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUNwQixJQUFJLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDakIsT0FBTyxnQkFBZ0I7b0JBQ3RCLENBQUMsQ0FBQyxRQUFRLENBQUMsMkNBQTJDLEVBQUUsZUFBZSxFQUFFLEtBQUssQ0FBQztvQkFDL0UsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxrQ0FBa0MsRUFBRSxZQUFZLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdEUsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU8sZ0JBQWdCO29CQUN0QixDQUFDLENBQUMsUUFBUSxDQUFDLHlDQUF5QyxFQUFFLGdCQUFnQixFQUFFLEtBQUssQ0FBQztvQkFDOUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSxhQUFhLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDckUsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxLQUFLLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2pCLE9BQU8sZ0JBQWdCO29CQUN0QixDQUFDLENBQUMsUUFBUSxDQUFDLHVDQUF1QyxFQUFFLFdBQVcsRUFBRSxLQUFLLENBQUM7b0JBQ3ZFLENBQUMsQ0FBQyxRQUFRLENBQUMsOEJBQThCLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzlELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLGdCQUFnQjtvQkFDdEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxxQ0FBcUMsRUFBRSxZQUFZLEVBQUUsS0FBSyxDQUFDO29CQUN0RSxDQUFDLENBQUMsUUFBUSxDQUFDLDRCQUE0QixFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM3RCxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLENBQUM7SUFDbkMsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUNwQixJQUFJLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNqQixPQUFPLGdCQUFnQjtnQkFDdEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQywwQ0FBMEMsRUFBRSxjQUFjLEVBQUUsS0FBSyxDQUFDO2dCQUM3RSxDQUFDLENBQUMsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNyRSxDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sZ0JBQWdCO2dCQUN0QixDQUFDLENBQUMsUUFBUSxDQUFDLHdDQUF3QyxFQUFFLGVBQWUsRUFBRSxLQUFLLENBQUM7Z0JBQzVFLENBQUMsQ0FBQyxRQUFRLENBQUMsK0JBQStCLEVBQUUsYUFBYSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BFLENBQUM7SUFDRixDQUFDO1NBQU0sQ0FBQztRQUNQLElBQUksS0FBSyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2pCLE9BQU8sZ0JBQWdCO2dCQUN0QixDQUFDLENBQUMsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUM7Z0JBQ3JFLENBQUMsQ0FBQyxRQUFRLENBQUMsNkJBQTZCLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzdELENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxnQkFBZ0I7Z0JBQ3RCLENBQUMsQ0FBQyxRQUFRLENBQUMsb0NBQW9DLEVBQUUsV0FBVyxFQUFFLEtBQUssQ0FBQztnQkFDcEUsQ0FBQyxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDNUQsQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxVQUFVLFlBQVksQ0FBQyxJQUFtQixFQUFFLGNBQXdCLEVBQUUsZ0JBQTBCO0lBQ3JHLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDOUIsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBRUQsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO0lBQ3JDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN2QyxNQUFNLHFCQUFxQixHQUFHLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDcEUscUJBQXFCLENBQUMsT0FBTyxDQUFDLHFCQUFxQixDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBRW5FLElBQUksSUFBSSxHQUFHLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7UUFDeEMsT0FBTyxRQUFRLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRCxJQUFJLElBQUksR0FBRyxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDO1FBQzVDLE9BQU8sUUFBUSxDQUFDLFdBQVcsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRUQsT0FBTyxPQUFPLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQ3hELENBQUM7QUFFRDs7Ozs7R0FLRztBQUNILE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxFQUFVLEVBQUUsZ0JBQTBCO0lBQ3ZFLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO0lBQ3BDLElBQUksT0FBTyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2pCLE9BQU8sZ0JBQWdCO1lBQ3RCLENBQUMsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsRUFBRSxDQUFDO1lBQ3RELENBQUMsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBQ0QsSUFBSSxPQUFPLEdBQUcsTUFBTSxFQUFFLENBQUM7UUFDdEIsT0FBTyxnQkFBZ0I7WUFDdEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxhQUFhLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7WUFDbkUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUNELElBQUksT0FBTyxHQUFHLElBQUksRUFBRSxDQUFDO1FBQ3BCLE9BQU8sZ0JBQWdCO1lBQ3RCLENBQUMsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEVBQUUsYUFBYSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDOUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN6RSxDQUFDO0lBQ0QsSUFBSSxPQUFPLEdBQUcsR0FBRyxFQUFFLENBQUM7UUFDbkIsT0FBTyxnQkFBZ0I7WUFDdEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUMxRSxDQUFDLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFDRCxPQUFPLFFBQVEsQ0FBQyxZQUFZLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMxRSxDQUFDO0FBRUQsTUFBTSxVQUFVLGdCQUFnQixDQUFDLElBQVU7SUFDMUMsT0FBTyxJQUFJLENBQUMsV0FBVyxFQUFFO1FBQ3hCLEdBQUcsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDO1FBQ2xELEdBQUcsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUM7UUFDN0MsR0FBRyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQztRQUM5QyxHQUFHLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDO1FBQ2hELEdBQUcsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUM7UUFDaEQsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM1RCxHQUFHLENBQUM7QUFDTixDQUFDO0FBRUQsTUFBTSxDQUFDLE1BQU0sUUFBUSxHQUFHO0lBQ3ZCLGNBQWMsQ0FBQyxPQUE4QixFQUFFLE9BQW9DO1FBQ2xGLE9BQU8sSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQ3BCLElBQUksQ0FBQztnQkFDSixPQUFPLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbEQsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUixPQUFPLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDcEQsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUNELFFBQVEsQ0FBQyxPQUE4QixFQUFFLE9BQThCO1FBQ3RFLE9BQU8sSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQ3BCLElBQUksQ0FBQztnQkFDSixPQUFPLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDNUMsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUixPQUFPLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDOUMsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUNELFNBQVMsQ0FBQyxPQUE4QixFQUFFLE9BQStCO1FBQ3hFLE9BQU8sSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQ3BCLElBQUksQ0FBQztnQkFDSixPQUFPLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDN0MsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUixPQUFPLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDL0MsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUNELE1BQU0sQ0FBQyxHQUF5QixFQUFFLE9BQTRCO1FBQzdELE9BQU8sSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQ3BCLElBQUksQ0FBQztnQkFDSixPQUFPLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDdEMsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUixPQUFPLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNuRCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBQ0QsWUFBWSxDQUFDLE9BQThCLEVBQUUsT0FBa0M7UUFDOUUsT0FBTyxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDcEIsSUFBSSxDQUFDO2dCQUNKLE9BQU8sSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNoRCxDQUFDO1lBQUMsTUFBTSxDQUFDO2dCQUNSLE9BQU8sSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNsRCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0QsQ0FBQyJ9