/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';
import { viewPath } from '../storybook-model.mjs';

addons.setConfig({
	theme: create({ base: 'light', brandTitle: 'VS Code Design System', brandUrl: './' }),
	showWhatsNew: false,
});
addons.register('vscode/live-source-navigation', api => {
	const events = new EventSource('/api/events');
	events.onmessage = event => {
		const { kind, view } = JSON.parse(event.data);
		if (kind === 'navigate') {
			api.selectStory(viewPath(view).split('/').at(-1));
		}
	};
	window.addEventListener('pagehide', () => events.close(), { once: true });
});
