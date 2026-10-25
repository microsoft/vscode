/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IUnattendedRestartReadiness } from '../../../../../platform/lifecycle/common/unattendedRestart.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { UnattendedRestartService } from '../../common/unattendedRestart.js';

suite('UnattendedRestartService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('aggregates blockers, treats failures as blockers and forgets disposed participants', async () => {
		const service = new UnattendedRestartService(store.add(new NullLogService()));
		const results: IUnattendedRestartReadiness[] = [await service.canRestartUnattended()];

		store.add(service.registerParticipant({ check: () => undefined }));
		store.add(service.registerParticipant({ check: () => 'terminal.runningProcess' }));
		store.add(service.registerParticipant({ check: async () => 'debug.sessionActive' }));
		store.add(service.registerParticipant({ check: () => 'terminal.runningProcess' }));
		const failing = service.registerParticipant({ check: () => { throw new Error('participant failure'); } });
		results.push(await service.canRestartUnattended());

		failing.dispose();
		results.push(await service.canRestartUnattended());

		assert.deepStrictEqual(results, [
			{ blockers: [] },
			{ blockers: ['debug.sessionActive', 'participant.error', 'terminal.runningProcess'] },
			{ blockers: ['debug.sessionActive', 'terminal.runningProcess'] },
		]);
	});

	test('blocks on participants that do not answer in time and cancels them', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const service = new UnattendedRestartService(store.add(new NullLogService()));
		let participantToken: CancellationToken | undefined;
		store.add(service.registerParticipant({
			check: token => {
				participantToken = token;
				return new Promise<string | undefined>(() => { /* never answers */ });
			}
		}));

		const readiness = await service.canRestartUnattended();

		assert.deepStrictEqual({ readiness, cancelled: participantToken?.isCancellationRequested }, {
			readiness: { blockers: ['participant.timeout'] },
			cancelled: true,
		});
	}));
});
