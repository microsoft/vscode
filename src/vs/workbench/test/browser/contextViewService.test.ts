/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, isShadowRoot } from '../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ContextViewDOMPosition, IContextViewRenderContext } from '../../../base/browser/ui/contextview/contextview.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../base/common/errors.js';
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

	function createWindowContainer() {
		const windowContainer = $('.window-container');
		const owner = $('.owner');
		windowContainer.appendChild(owner);
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
		return { windowContainer, owner, service };
	}

	function createDelegate(hostAsPopover?: boolean) {
		const contexts: (IContextViewRenderContext | undefined)[] = [];
		return {
			contexts,
			delegate: {
				hostAsPopover,
				getAnchor: () => ({ x: 0, y: 0 }),
				render: (_container: HTMLElement, context?: IContextViewRenderContext) => {
					contexts.push(context);
					return Disposable.None;
				}
			}
		};
	}

	test('hosts a popover at the given container only when the delegate opts in', () => {
		const { owner, service } = createWindowContainer();
		const results: unknown[] = [];
		for (const [hostAsPopover, shadowRoot, useWindowContainerForShadowRoot] of [
			[true, false, false],
			[true, true, false],
			[true, true, true],
			[undefined, false, false],
			[undefined, true, false],
		] as const) {
			const { delegate, contexts } = createDelegate(hostAsPopover);
			service.showContextView(delegate, owner, shadowRoot, useWindowContainerForShadowRoot);
			const element = service.getContextViewElement();
			const root = element.getRootNode();
			const host = isShadowRoot(root) ? root.host : element;
			results.push({ domPosition: contexts[0]?.domPosition, inOwner: owner.contains(host), popover: host.hasAttribute('popover') });
			service.hideContextView();
		}

		assert.deepStrictEqual(results, [
			{ domPosition: ContextViewDOMPosition.POPOVER, inOwner: true, popover: true },
			{ domPosition: ContextViewDOMPosition.POPOVER_SHADOW, inOwner: true, popover: true },
			{ domPosition: ContextViewDOMPosition.FIXED_SHADOW, inOwner: false, popover: false },
			{ domPosition: ContextViewDOMPosition.FIXED, inOwner: true, popover: false },
			{ domPosition: ContextViewDOMPosition.FIXED_SHADOW, inOwner: true, popover: false },
		]);
	});

	test('falls back to the layout container of the owner window without reporting an error when the owner is disconnected', () => {
		const { windowContainer, service } = createWindowContainer();
		const errors: unknown[] = [];
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(e => errors.push(e));
		disposables.add(toDisposable(() => setUnexpectedErrorHandler(previousHandler)));
		const disconnectedOwner = $('.disconnected-owner');

		const { delegate, contexts } = createDelegate(true);
		service.showContextView(delegate, disconnectedOwner);
		const element = service.getContextViewElement();

		assert.deepStrictEqual({
			domPosition: contexts[0]?.domPosition,
			parent: element.parentElement === windowContainer,
			popover: element.hasAttribute('popover'),
			errors: errors.length
		}, {
			domPosition: ContextViewDOMPosition.FIXED,
			parent: true,
			popover: false,
			errors: 0
		});
		service.hideContextView();
	});
});
