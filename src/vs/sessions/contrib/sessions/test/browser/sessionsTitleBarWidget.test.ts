/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionsTitleBarWidget } from '../../browser/sessionsTitleBarWidget.js';

suite('SessionsTitleBarWidget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const getCommandCenterTitle = Reflect.get(SessionsTitleBarWidget.prototype, '_getCommandCenterTitle') as (this: SessionsTitleBarWidget) => string | undefined;
	const getCommandCenterTitles = Reflect.get(SessionsTitleBarWidget.prototype, '_getCommandCenterTitles') as (this: SessionsTitleBarWidget) => { sessionTitle: string | undefined; contextTitle: string | undefined };

	test('prepends the active session title to the command-center context', () => {
		const widget = Object.create(SessionsTitleBarWidget.prototype) as SessionsTitleBarWidget;
		Reflect.set(widget, '_workspaceInfo', { label: 'vscode-tools' });
		Reflect.set(widget, '_isQuickChat', false);
		Reflect.set(widget, '_sessionTitle', undefined);
		Reflect.set(widget, '_activeSessionTitle', undefined);
		Reflect.set(widget, '_activeChatTitle', undefined);
		const standardPresentation = getCommandCenterTitles.call(widget);

		Reflect.set(widget, '_activeSessionTitle', 'General help');
		Reflect.set(widget, '_activeChatTitle', 'Current chat');
		const sessionViewPresentation = {
			titles: getCommandCenterTitles.call(widget),
			combinedTitle: getCommandCenterTitle.call(widget),
		};

		Reflect.set(widget, '_activeChatTitle', 'General help');
		const matchingChatTitlePresentation = {
			titles: getCommandCenterTitles.call(widget),
			combinedTitle: getCommandCenterTitle.call(widget),
		};

		Reflect.set(widget, '_activeChatTitle', 'Current chat');
		Reflect.set(widget, '_sessionTitle', 'Custom context');
		const customContextPresentation = {
			titles: getCommandCenterTitles.call(widget),
			combinedTitle: getCommandCenterTitle.call(widget),
		};

		assert.deepStrictEqual({
			standardPresentation,
			sessionViewPresentation,
			matchingChatTitlePresentation,
			customContextPresentation,
		}, {
			standardPresentation: {
				sessionTitle: undefined,
				contextTitle: 'vscode-tools',
			},
			sessionViewPresentation: {
				titles: {
					sessionTitle: 'General help',
					contextTitle: 'vscode-tools',
				},
				combinedTitle: 'General help · vscode-tools',
			},
			matchingChatTitlePresentation: {
				titles: {
					sessionTitle: undefined,
					contextTitle: 'vscode-tools',
				},
				combinedTitle: 'vscode-tools',
			},
			customContextPresentation: {
				titles: {
					sessionTitle: 'General help',
					contextTitle: 'Custom context',
				},
				combinedTitle: 'General help · Custom context',
			},
		});
	});
});
