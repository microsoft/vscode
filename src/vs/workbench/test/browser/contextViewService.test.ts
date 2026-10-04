/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, isShadowRoot } from '../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ContextViewService } from '../../../platform/contextview/browser/contextViewService.js';
import { TestLayoutService } from './workbenchTestServices.js';

suite('ContextViewService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('mounts requested shadow roots in the window container', () => {
		const windowContainer = $('.window-container');
		const localContainer = $('.local-container');
		windowContainer.appendChild(localContainer);
		document.body.appendChild(windowContainer);
		disposables.add(toDisposable(() => windowContainer.remove()));

		class TestWindowLayoutService extends TestLayoutService {
			override mainContainer = windowContainer;
			override activeContainer = windowContainer;
			override containers = [windowContainer];

			override getContainer(): HTMLElement {
				return windowContainer;
			}
		}

		const service = disposables.add(new ContextViewService(new TestWindowLayoutService()));
		const delegate = {
			getAnchor: () => ({ x: 0, y: 0 }),
			render: () => Disposable.None
		};

		service.showContextView(delegate, localContainer, true, true);
		const windowMountedHost = service.getContextViewElement().getRootNode();
		assert.ok(isShadowRoot(windowMountedHost));
		const windowMountedAtRoot = windowMountedHost.host.parentElement === windowContainer;

		service.hideContextView();
		service.showContextView(delegate, localContainer, true);
		const locallyMountedHost = service.getContextViewElement().getRootNode();
		assert.ok(isShadowRoot(locallyMountedHost));

		assert.deepStrictEqual({
			windowMountedAtRoot,
			locallyMounted: locallyMountedHost.host.parentElement === localContainer
		}, {
			windowMountedAtRoot: true,
			locallyMounted: true
		});

	});
});
