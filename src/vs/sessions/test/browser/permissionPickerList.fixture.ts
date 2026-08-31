/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderPermissionPickerList } from '../../../workbench/test/browser/componentFixtures/chat/permissionPickerList.fixture.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import '../../browser/media/style.css';

function render(context: ComponentFixtureContext, checked: boolean, width = 320): void {
	context.container.classList.add('agent-sessions-workbench');
	renderPermissionPickerList(context, { showStandaloneSandboxToggle: true, sandboxingEnabled: checked, width });

	const row = context.container.querySelector<HTMLElement>('.has-standalone-toggle');
	const toggle = row?.querySelector<HTMLElement>('.action-list-inline-switch');
	if (!row || !toggle) {
		throw new Error('Expected a standalone sandbox toggle row');
	}
	toggle.focus();

	const rowBounds = row.getBoundingClientRect();
	const toggleBounds = toggle.getBoundingClientRect();
	if (toggleBounds.right > rowBounds.right - 6 || toggleBounds.top < rowBounds.top || toggleBounds.bottom > rowBounds.bottom) {
		throw new Error(`The sandbox toggle must stay inset within its menu row: row=${JSON.stringify(rowBounds)}, toggle=${JSON.stringify(toggleBounds)}`);
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/permissionPickerList' }, {
	SandboxToggleOff: defineComponentFixture({
		render: context => render(context, false),
	}),
	SandboxToggleOn: defineComponentFixture({
		render: context => render(context, true),
	}),
	SandboxToggleNarrow: defineComponentFixture({
		render: context => render(context, false, 255),
	}),
});
