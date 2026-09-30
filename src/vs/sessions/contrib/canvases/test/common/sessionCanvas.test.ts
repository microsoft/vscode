/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISessionCanvas, SessionCanvasAvailability } from '../../../../services/sessions/common/session.js';
import { SessionCanvasInput } from '../../common/sessionCanvas.js';

suite('SessionCanvasInput', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps transient sources out of editor identity and does not restore', () => {
		const source = 'https://secret.example/canvas?token=sensitive';
		const canvas = (title: string, revision: number): ISessionCanvas => ({
			resource: URI.parse('agent-host-canvas:/preview'),
			instanceId: 'preview',
			title,
			revision,
			availability: SessionCanvasAvailability.Ready,
			resolveSource: async () => URI.parse(source),
		});
		const input = store.add(new SessionCanvasInput({
			providerId: 'local-agent-host',
			session: URI.parse('agent-host-session:/session'),
			chat: URI.parse('agent-host-chat:/session/main'),
			canvas: URI.parse('agent-host-canvas:/preview'),
		}, canvas('Preview', 1)));
		const labels: string[] = [];
		store.add(input.onDidChangeLabel(() => labels.push(input.getName())));

		input.setCanvas(canvas('Updated Preview', 2));

		assert.deepStrictEqual({
			name: input.getName(),
			labels,
			canReopen: input.canReopen(),
			containsSource: input.resource.toString().includes('secret.example'),
		}, {
			name: 'Updated Preview',
			labels: ['Updated Preview'],
			canReopen: false,
			containsSource: false,
		});
	});
});
