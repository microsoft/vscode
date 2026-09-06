/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { classifySessionWorkspaceTopology, getSessionsTelemetryProviderId, hashSessionIdForTelemetry } from '../../common/sessionsTelemetry.js';

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
});
