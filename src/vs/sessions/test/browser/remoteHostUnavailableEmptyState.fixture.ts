/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { type IRemoteHostUnavailableEmptyStateContent, RemoteHostUnavailableEmptyState } from '../../browser/parts/remoteHostUnavailableEmptyState.js';

export default defineThemedFixtureGroup({ path: 'sessions/remoteHostUnavailable/' }, {
	HostNotRunning: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderUnavailableState(context, {
			title: 'Unable to Connect to WSL: Ubuntu',
			description: 'WSL: Ubuntu is not running.',
			action: { label: 'Start WSL: Ubuntu', run: () => { } },
			autoConnect: { label: 'Automatically Start WSL: Ubuntu', checked: false, onChange: () => { } },
		}),
	}),

	HostNotRunningAutoStart: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderUnavailableState(context, {
			title: 'Unable to Connect to WSL: Ubuntu',
			description: 'WSL: Ubuntu is not running.',
			action: { label: 'Start WSL: Ubuntu', run: () => { } },
			autoConnect: { label: 'Automatically Start WSL: Ubuntu', checked: true, onChange: () => { } },
		}),
	}),

	HostDisconnected: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderUnavailableState(context, {
			title: 'Cannot Connect to WSL: Ubuntu',
			description: 'Cannot reach WSL: Ubuntu.',
		}),
	}),

	Connecting: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderUnavailableState(context, {
			title: 'Connecting to WSL: Ubuntu',
			description: 'Starting WSL: Ubuntu.',
			progress: 'Downloading server (80%)',
		}),
	}),
});

function renderUnavailableState({ container, disposableStore }: ComponentFixtureContext, content: IRemoteHostUnavailableEmptyStateContent): void {
	container.style.position = 'relative';
	container.style.width = 'var(--session-view-centered-content-max-width)';
	container.style.height = 'calc(var(--vscode-spacing-size400) * 6)';
	container.style.backgroundColor = 'var(--vscode-editorWidget-background)';

	const state = disposableStore.add(new RemoteHostUnavailableEmptyState());
	state.setContent(content);
	container.appendChild(state.domNode);
}
