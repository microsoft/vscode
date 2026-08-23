/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { COPILOT_CLI_EH_SCHEME, COPILOT_CLI_LOCAL_AH_SCHEME, dedupeMigratedCopilotCliSessions, migratedCopilotCliResource } from '../../browser/copilotCliEventsUri.js';

suite('copilotCliEventsUri', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const RAW_ID = 'sess-abc';
	const legacy = URI.from({ scheme: COPILOT_CLI_EH_SCHEME, path: `/${RAW_ID}` });
	const twin = URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: `/${RAW_ID}` });
	const remote = URI.from({ scheme: `remote-host1-${COPILOT_CLI_EH_SCHEME}`, path: `/${RAW_ID}` });

	function dedupe(...resources: URI[]): string[] {
		return dedupeMigratedCopilotCliSessions(resources, resource => resource).map(resource => resource.toString());
	}

	suite('dedupeMigratedCopilotCliSessions', () => {

		test('drops the legacy row once its agent-host twin is present', () => {
			assert.deepStrictEqual(dedupe(legacy, twin), [twin.toString()]);
		});

		test('keeps a legacy row that has no twin', () => {
			assert.deepStrictEqual(dedupe(legacy), [legacy.toString()]);
		});

		test('never drops a remote session sharing the raw id of a local twin', () => {
			// `remote-<authority>-copilotcli:` is a different session on a different
			// host, even when the underlying SDK id collides with a local one.
			assert.deepStrictEqual(dedupe(remote, twin), [remote.toString(), twin.toString()]);
		});

		test('leaves unrelated sessions untouched', () => {
			const other = URI.from({ scheme: 'agent-host-claude', path: '/c1' });
			assert.deepStrictEqual(dedupe(other, legacy, twin), [other.toString(), twin.toString()]);
		});

		test('drops only the legacy row whose id matches', () => {
			const otherLegacy = URI.from({ scheme: COPILOT_CLI_EH_SCHEME, path: '/sess-other' });
			assert.deepStrictEqual(dedupe(legacy, otherLegacy, twin), [otherLegacy.toString(), twin.toString()]);
		});
	});

	suite('migratedCopilotCliResource', () => {

		test('maps a legacy resource to its agent-host twin', () => {
			assert.strictEqual(migratedCopilotCliResource(legacy)?.toString(), twin.toString());
		});

		test('declines resources that are not legacy Copilot CLI sessions', () => {
			assert.deepStrictEqual(
				[twin, remote, URI.from({ scheme: 'agent-host-claude', path: '/c1' }), undefined].map(resource => migratedCopilotCliResource(resource)),
				[undefined, undefined, undefined, undefined],
			);
		});
	});
});
