/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

function renderLoopContextProbe(context: ComponentFixtureContext): void {
	const targetWindow = dom.getWindow(context.container);
	const target = dom.append(context.container, dom.$('.resize-observer-context-target'));
	target.style.width = '100px';
	target.style.height = '10px';

	const status = dom.append(context.container, dom.$('.resize-observer-context-status'));
	status.textContent = 'Waiting for ResizeObserver loop warning';
	status.dataset.warningCount = '0';

	const observation = context.disposableStore.add(new MutableDisposable<IDisposable>());
	context.disposableStore.add(dom.addDisposableListener(targetWindow, dom.EventType.ERROR, event => {
		if (!(event instanceof ErrorEvent) || !event.message.includes('ResizeObserver loop')) {
			return;
		}

		status.dataset.warningCount = '1';
		status.dataset.observerContext = dom.getRecentDisposableResizeObserverContextForLoopError(event.message, targetWindow) ?? '';
		status.textContent = 'Captured ResizeObserver loop warning';
		observation.clear();
	}));

	const observer = context.disposableStore.add(new dom.DisposableResizeObserver(
		'ResizeObserverContextFixture.selfResizer',
		() => target.style.width = `${target.getBoundingClientRect().width + 1}px`,
		targetWindow,
	));
	observation.value = observer.observe(target);
}

export default defineThemedFixtureGroup({ path: 'base/resizeObserver/' }, {
	LoopContext: defineComponentFixture({
		labels: { kind: 'animated' },
		virtualTime: { enabled: false },
		render: renderLoopContextProbe,
	}),
});
