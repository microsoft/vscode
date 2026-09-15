/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IProjectBoardCard } from './projectBoardModel.js';

interface IObservedState {
	readonly status: IProjectBoardCard['status'];
	readonly since: number;
	readonly lowerBound: boolean;
	readonly disconnected: boolean;
}

/** Tracks observed transitions, not prompt, output or visit timestamps. */
export class ProjectBoardStateDurations {
	private readonly states = new Map<string, IObservedState>();

	update(cards: readonly Pick<IProjectBoardCard, 'id' | 'status' | 'connection'>[], now = Date.now()): void {
		const ids = new Set(cards.map(card => card.id));
		for (const id of this.states.keys()) {
			if (!ids.has(id)) {
				this.states.delete(id);
			}
		}
		for (const card of cards) {
			const previous = this.states.get(card.id);
			const disconnected = !!card.connection;
			if (!previous || previous.status !== card.status || previous.disconnected !== disconnected) {
				this.states.set(card.id, {
					status: card.status, since: now, disconnected,
					lowerBound: !previous || previous.disconnected || disconnected,
				});
			}
		}
	}

	getLabel(cardId: string, now = Date.now(), compact = false): string {
		const state = this.states.get(cardId);
		if (!state || state.disconnected) {
			return compact ? localize('projectBoard.durationUnavailableCompact', "Unavailable") : localize('projectBoard.durationUnavailable', "Time in state: unavailable");
		}
		const seconds = Math.max(0, Math.floor((now - state.since) / 1000));
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor(seconds / 60) % 60;
		const duration = `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
		if (compact) {
			return state.lowerBound ? localize('projectBoard.durationLowerBoundCompact', "≥ {0}", duration) : duration;
		}
		return state.lowerBound
			? localize('projectBoard.durationLowerBound', "Time in state: at least {0}", duration)
			: localize('projectBoard.duration', "Time in state: {0}", duration);
	}
}
