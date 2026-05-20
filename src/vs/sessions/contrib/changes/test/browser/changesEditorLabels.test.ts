/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeHex, VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_LABEL_FORMATTER, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { TestEnvironmentService, TestLifecycleService, TestPathService, TestRemoteAgentService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { TestContextService, TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { LabelService } from '../../../../../workbench/services/label/common/labelService.js';
import { getChangesEditorLabels } from '../../browser/changesEditorLabels.js';

suite('ChangesEditorLabels', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createLabelService(): LabelService {
		const labelService = disposables.add(new LabelService(
			TestEnvironmentService,
			new TestContextService(),
			new TestPathService(URI.file('/Users/test')),
			new TestRemoteAgentService(),
			disposables.add(new TestStorageService()),
			disposables.add(new TestLifecycleService())
		));
		disposables.add(labelService.registerFormatter(AGENT_HOST_LABEL_FORMATTER));
		return labelService;
	}

	function hex(value: string): string {
		return encodeHex(VSBuffer.fromString(value)).toString();
	}

	test('labels are derived from the display file URI, not the backing git blob URI', () => {
		const labelService = createLabelService();
		const displayUri = toAgentHostUri(URI.file('/workspaces/demo/src/app.ts'), 'remotehost');
		const backingUri = toAgentHostUri(URI.from({
			scheme: 'git-blob',
			authority: hex('session-db://session-123'),
			path: `/abc123/${hex('src/app.ts')}/app.ts`
		}), 'remotehost');

		assert.deepStrictEqual({
			display: getChangesEditorLabels(displayUri, labelService),
			backing: getChangesEditorLabels(backingUri, labelService),
		}, {
			display: {
				label: 'app.ts',
				description: '/workspaces/demo/src',
			},
			backing: {
				label: 'app.ts',
				description: '/abc123/7372632f6170702e7473',
			},
		});
	});

});
