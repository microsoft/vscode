/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { classifySessionWorkspaceTopology, getNonArchivedSessionListCount, getSessionsTelemetryProviderId, hashSessionIdForTelemetry, logSessionsListCompactViewState } from '../../common/sessionsTelemetry.js';
import { ISession } from '../../services/sessions/common/session.js';

suite('sessionsTelemetry helpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifySessionWorkspaceTopology reconciles folder counts', () => {
		assert.deepStrictEqual(classifySessionWorkspaceTopology(3, 2), {
			folderCount: 3,
			gitFolderCount: 2,
			nonGitFolderCount: 1,
			isMultiRoot: true,
		});
	});

	test('classifySessionWorkspaceTopology treats a single folder as single-root', () => {
		assert.deepStrictEqual(classifySessionWorkspaceTopology(1, 1), {
			folderCount: 1,
			gitFolderCount: 1,
			nonGitFolderCount: 0,
			isMultiRoot: false,
		});
	});

	test('provider IDs are bounded for telemetry', () => {
		assert.deepStrictEqual([
			getSessionsTelemetryProviderId('default-copilot'),
			getSessionsTelemetryProviderId('local-agent-host'),
			getSessionsTelemetryProviderId('agenthost-example.internal:1234'),
			getSessionsTelemetryProviderId('agenthost-b3BhcXVlLXR1bm5lbC1pZA'),
			getSessionsTelemetryProviderId('extension-provider'),
		], [
			'default-copilot',
			'local-agent-host',
			'remote-agent-host',
			'remote-agent-host',
			'other',
		]);
	});

	test('session IDs are hashed for telemetry correlation', () => {
		assert.deepStrictEqual([
			hashSessionIdForTelemetry('agenthost-example.internal:1234:session://first'),
			hashSessionIdForTelemetry('agenthost-example.internal:1234:session://first'),
			hashSessionIdForTelemetry('agenthost-example.internal:1234:session://second'),
		], [
			'4f42482f1374bb5f11b7f1c0abbc96954bddd505',
			'4f42482f1374bb5f11b7f1c0abbc96954bddd505',
			'51f47747e460010ae1c437b9a269e980137d96ec',
		]);
	});

	test('counts only non-archived sessions shown in the primary Sessions list', () => {
		const createSession = (isArchived: boolean, isAutomation?: boolean): ISession => upcastPartial<ISession>({
			isArchived: constObservable(isArchived),
			isAutomation: isAutomation === undefined ? undefined : constObservable(isAutomation),
		});

		assert.strictEqual(getNonArchivedSessionListCount([
			createSession(false),
			createSession(false, false),
			createSession(true),
			createSession(false, true),
		]), 2);
	});

	test('logs the compact Sessions list preference', () => {
		const events: { name: string | undefined; data: unknown }[] = [];
		const telemetryService = new class extends mock<ITelemetryService>() {
			override publicLog2(eventName?: string, data?: unknown): void {
				events.push({ name: eventName, data });
			}
		}();

		logSessionsListCompactViewState(telemetryService, true);

		assert.deepStrictEqual(events, [{
			name: 'vscodeAgents.sessionsList/compactViewState',
			data: { enabled: true },
		}]);
	});
});
