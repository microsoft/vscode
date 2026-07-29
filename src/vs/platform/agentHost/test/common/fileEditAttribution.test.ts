/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildCancelEditAttributionResource, buildCommitEditAttributionResource, buildPrepareEditAttributionResource, parseEditAttributionResource } from '../../common/fileEditAttribution.js';

suite('File Edit Attribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips prepare and commit resource requests', () => {
		const prepare = {
			resource: URI.file('C:\\repo\\file.ts'),
			trigger: 'hashChange',
			statsUuid: 'stats-1',
			isDirty: false,
			flushToken: 'flush-1',
			languageId: 'typescript',
		} as const;
		const commit = {
			flushToken: 'flush-1',
			totalModifiedCount: 42,
		};
		const cancel = { flushToken: 'flush-1' };

		const parsedPrepare = parseEditAttributionResource(buildPrepareEditAttributionResource(prepare));
		assert.deepStrictEqual({
			prepare: parsedPrepare?.kind === 'prepare' ? {
				kind: parsedPrepare.kind,
				resource: parsedPrepare.params.resource.toString(),
				trigger: parsedPrepare.params.trigger,
				statsUuid: parsedPrepare.params.statsUuid,
				isDirty: parsedPrepare.params.isDirty,
				flushToken: parsedPrepare.params.flushToken,
				languageId: parsedPrepare.params.languageId,
			} : parsedPrepare,
			commit: parseEditAttributionResource(buildCommitEditAttributionResource(commit)),
			cancel: parseEditAttributionResource(buildCancelEditAttributionResource(cancel)),
		}, {
			prepare: {
				kind: 'prepare',
				resource: prepare.resource.toString(),
				trigger: prepare.trigger,
				statsUuid: prepare.statsUuid,
				isDirty: prepare.isDirty,
				flushToken: prepare.flushToken,
				languageId: prepare.languageId,
			},
			commit: { kind: 'commit', params: commit },
			cancel: { kind: 'cancel', params: cancel },
		});
	});
});
