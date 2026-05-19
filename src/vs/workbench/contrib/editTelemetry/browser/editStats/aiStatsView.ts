/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { n } from '../../../../../base/browser/dom.js';
import { safeIntl } from '../../../../../base/common/date.js';
import { derived, IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IAiStatsOverview } from './aiStatsFeature.js';
import './media.css';

const compactFormatter = safeIntl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const dateFormatter = safeIntl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/**
 * Minimal interface used by the status bar so this file does not depend on
 * the concrete feature class (avoids cyclic import).
 */
export interface IAiStatsHoverData {
	readonly overview: IObservable<IAiStatsOverview>;
	triggerRecompute(): void;
}

export interface IAiStatsHoverOptions {
	readonly data: IAiStatsHoverData;
}

export function createAiStatsHover(options: IAiStatsHoverOptions) {
	return n.div({
		class: 'ai-stats-status-bar',
		style: { minWidth: '320px' },
	}, [
		// Stats grid
		derived(reader => {
			const overview = options.data.overview.read(reader);
			return n.div({ class: 'ai-stats-grid' }, [
				statCell(localize('aiStats.metric.totalTokens', "Total tokens"), compactFormatter.value.format(overview.totalTokens)),
				statCell(localize('aiStats.metric.currentStreak', "Current streak"), formatStreak(overview.currentStreak)),
				statCell(localize('aiStats.metric.tokensPerDay', "Avg tokens / day"), compactFormatter.value.format(overview.avgTokensPerDay)),
			]);
		}),

		// Favorite model row (own row because model ids can be long)
		derived(reader => {
			const overview = options.data.overview.read(reader);
			return n.div({ class: 'ai-stats-row' }, [
				n.div({ class: 'ai-stats-row-label' }, [localize('aiStats.metric.favoriteModel', "Favorite model")]),
				n.div({ class: 'ai-stats-row-value' }, [overview.favoriteModel ?? '\u2014']),
			]);
		}),

		// Most active day row
		derived(reader => {
			const overview = options.data.overview.read(reader);
			return n.div({ class: 'ai-stats-row' }, [
				n.div({ class: 'ai-stats-row-label' }, [localize('aiStats.metric.topDay', "Most active day")]),
				n.div({ class: 'ai-stats-row-value' }, [formatTopDay(overview.topDay)]),
			]);
		}),
	]);
}

function statCell(label: string, value: string) {
	return n.div({ class: 'ai-stats-cell' }, [
		n.div({ class: 'ai-stats-cell-label' }, [label]),
		n.div({ class: 'ai-stats-cell-value' }, [value]),
	]);
}

function formatStreak(days: number): string {
	if (days <= 0) {
		return '\u2014';
	}
	if (days === 1) {
		return localize('aiStats.streakDay', "1 day");
	}
	return localize('aiStats.streakDays', "{0} days", days);
}

function formatTopDay(topDay: IAiStatsOverview['topDay']): string {
	if (!topDay) {
		return '\u2014';
	}
	const date = dateFormatter.value.format(new Date(topDay.dateMs));
	const tokens = compactFormatter.value.format(topDay.tokens);
	return localize('aiStats.topDayValue', "{0} \u2014 {1} tokens", date, tokens);
}
