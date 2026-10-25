/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IUnattendedRestartReadiness } from '../../../../platform/lifecycle/common/unattendedRestart.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export const IUnattendedRestartService = createDecorator<IUnattendedRestartService>('unattendedRestartService');

/**
 * Reports whether the state a component owns survives a restart unchanged.
 * Checks must be quick and must not have side effects.
 */
export interface IUnattendedRestartParticipant {

	/**
	 * @returns a stable, non-localized blocker identifier (e.g. `terminal.runningProcess`)
	 * when restarting would lose or change state, or `undefined` otherwise.
	 */
	check(token: CancellationToken): string | undefined | Promise<string | undefined>;
}

/**
 * Decides whether this window can be restarted (e.g. to apply an update while the user
 * is away) and restored exactly as it was. Anything that cannot be proven safe blocks.
 */
export interface IUnattendedRestartService {

	readonly _serviceBrand: undefined;

	registerParticipant(participant: IUnattendedRestartParticipant): IDisposable;

	canRestartUnattended(token?: CancellationToken): Promise<IUnattendedRestartReadiness>;
}

export class UnattendedRestartService implements IUnattendedRestartService {

	declare readonly _serviceBrand: undefined;

	static readonly PARTICIPANT_TIMEOUT = 5000;

	private readonly participants = new Set<IUnattendedRestartParticipant>();

	constructor(
		@ILogService private readonly logService: ILogService
	) { }

	registerParticipant(participant: IUnattendedRestartParticipant): IDisposable {
		this.participants.add(participant);

		return toDisposable(() => this.participants.delete(participant));
	}

	async canRestartUnattended(token = CancellationToken.None): Promise<IUnattendedRestartReadiness> {
		const results = await Promise.all(Array.from(this.participants, participant => this.check(participant, token)));
		const blockers = Array.from(new Set(results.filter(result => result !== undefined))).sort();

		if (blockers.length > 0) {
			this.logService.info(`[unattended restart] blocked by: ${blockers.join(', ')}`);
		}

		return { blockers };
	}

	private async check(participant: IUnattendedRestartParticipant, token: CancellationToken): Promise<string | undefined> {
		const cts = new CancellationTokenSource(token);
		try {
			const result = await raceTimeout(Promise.resolve(participant.check(cts.token)).then(blocker => ({ blocker })), UnattendedRestartService.PARTICIPANT_TIMEOUT);

			return result ? result.blocker : 'participant.timeout';
		} catch (error) {
			this.logService.error('[unattended restart] participant failed', error);

			return 'participant.error';
		} finally {
			cts.dispose(true);
		}
	}
}

registerSingleton(IUnattendedRestartService, UnattendedRestartService, InstantiationType.Delayed);
