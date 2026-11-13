/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { PromptTimelineGutterRail } from '../../../../contrib/chat/browser/promptTimeline/promptTimelineGutterRail.js';
import { PromptTick } from '../../../../contrib/chat/browser/promptTimeline/promptTimelineModel.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

function tick(requestId: string, text: string, stat?: PromptTick['stat']): PromptTick {
	return {
		requestId,
		allRequestIds: [requestId],
		text,
		timestamp: 0,
		count: 1,
		ariaLabel: `Prompt: ${text}`,
		stat,
	};
}

function renderPromptTimelineGutter({ container, disposableStore }: ComponentFixtureContext): void {
	container.classList.add('monaco-workbench', 'agent-sessions-workbench');
	container.style.width = '340px';
	container.style.height = '260px';
	container.style.position = 'relative';
	container.style.background = 'var(--vscode-editor-background)';

	const host = DOM.append(container, DOM.$('.prompt-timeline-host'));
	host.style.width = '320px';
	host.style.height = '240px';
	host.style.position = 'relative';

	const rail = disposableStore.add(new PromptTimelineGutterRail());
	host.appendChild(rail.domNode);
	rail.setHostWidth(320);
	rail.setTicks([
		tick('one', 'Investigate the failure'),
		tick('two', 'Do a thing', { added: 3, removed: 1, fileCount: 1 }),
		tick('three', 'Do something that needs input'),
	]);
	rail.setActive('two');
	rail.domNode.classList.add('revealed');
	const activeJump = rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-row-jump')[1];
	activeJump.classList.add('hovered');
}

export default defineThemedFixtureGroup({ path: 'chat/promptTimelineGutter/' }, {
	ActivePromptHover: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['The active prompt row is pointer-hovered in the Prompt Timeline gutter. In high contrast themes, a dashed active-contrast boundary keeps the hover visible over the active-row state.'],
		render: renderPromptTimelineGutter,
	}),
});
