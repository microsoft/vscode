/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { HoverPosition } from '../../../../../../base/browser/ui/hover/hoverWidget.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IVoicePlaybackService } from '../../../common/voicePlaybackService.js';
import { AgentSessionRenderer, AgentSessionSectionRenderer } from '../../../browser/agentSessions/agentSessionsViewer.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';

suite('AgentSessionsRenderer', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('adds item classes to a normal tree row', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() { });
		instantiationService.stub(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() { });
		const renderer = store.add(instantiationService.createInstance(
			AgentSessionRenderer,
			{ disableHover: true, getHoverPosition: () => HoverPosition.BELOW },
			undefined,
			observableValue<URI | undefined>('activeSessionResource', undefined),
		));
		const row = document.createElement('div');
		row.classList.add('monaco-list-row');
		const treeRow = document.createElement('div');
		const contents = document.createElement('div');
		row.appendChild(treeRow).appendChild(contents);

		const template = renderer.renderTemplate(contents);
		store.add({ dispose: () => renderer.disposeTemplate(template) });

		assert.deepStrictEqual([...row.classList], [
			'monaco-list-row',
			'agent-session-list-row',
			'agent-session-item-row',
		]);
	});

	test('adds section classes when the container is a sticky row', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const renderer = instantiationService.createInstance(AgentSessionSectionRenderer, {});
		const stickyRow = document.createElement('div');
		stickyRow.classList.add('monaco-list-row');

		const template = renderer.renderTemplate(stickyRow);
		store.add({ dispose: () => renderer.disposeTemplate(template) });

		assert.deepStrictEqual([...stickyRow.classList], [
			'monaco-list-row',
			'agent-session-list-row',
			'agent-session-section-row',
		]);
	});
});
