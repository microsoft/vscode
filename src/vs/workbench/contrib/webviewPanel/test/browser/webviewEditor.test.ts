/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, Dimension } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IOverlayWebview } from '../../../webview/browser/webview.js';
import { WebviewEditor } from '../../browser/webviewEditor.js';
import { WebviewInput } from '../../browser/webviewEditorInput.js';

suite('WebviewEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a shared input is laid out only by the group that currently owns its webview', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const container = append(mainWindow.document.body, $('.webview-editor-test'));
		disposables.add(toDisposable(() => container.remove()));
		let anchor: HTMLElement | undefined;
		let owner: object | undefined;
		const webview = new class extends mock<IOverlayWebview>() {
			override readonly container = $('.test-webview');
			override readonly options = {};
			override readonly onDidFocus = Event.None;
			override claim(claimant: object) { owner = claimant; }
			override release(claimant: object) { if (owner === claimant) { owner = undefined; } }
			override setAnchorElement(element: HTMLElement) { anchor = element; }
			override dispose() { }
		};
		const input = disposables.add(instantiationService.createInstance(WebviewInput, {
			viewType: 'test', providedId: undefined, name: 'Test', iconPath: undefined,
		}, webview));
		const source = disposables.add(instantiationService.createInstance(WebviewEditor, new TestEditorGroupView(1)));
		source.create(container);
		await source.setInput(input, undefined, {}, CancellationToken.None);
		source.layout(new Dimension(400, 300));
		const inlineAnchor = anchor;
		const dialogAnchor = append(container, $('.dialog-anchor'));
		const dialogOwner = {};
		input.updateGroup(2);
		webview.claim(dialogOwner);
		webview.setAnchorElement(dialogAnchor);
		source.setVisible(false);
		source.setVisible(true);
		source.layout(new Dimension(300, 200));
		const expandedAnchor = anchor;
		const expandedOwner = owner;
		input.updateGroup(1);
		source.layout(new Dimension(400, 300));
		assert.deepStrictEqual({
			inline: inlineAnchor === container,
			expanded: expandedAnchor === dialogAnchor,
			ownerUnchanged: expandedOwner === dialogOwner,
			restored: anchor === container,
		}, { inline: true, expanded: true, ownerUnchanged: true, restored: true });
	});
});
