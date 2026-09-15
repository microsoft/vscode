/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../base/common/event.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { constObservable } from '../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { CustomViewNode } from '../../browser/parts/customViewNode.js';
import { AbstractCustomView, ICustomViewViewport } from '../../services/customView/browser/customView.js';

class ViewportTestView extends AbstractCustomView {
	readonly title = constObservable('Viewport test');
	readonly updates = this._register(new Emitter<ICustomViewViewport>());
	viewport: ICustomViewViewport | undefined;
	readonly content = document.createElement('div');
	override readonly maxWidth = 500;
	lastWidth = 0;

	constructor(onCreate: (view: ViewportTestView) => void) { super(); onCreate(this); }

	render(container: HTMLElement): void {
		this.content.style.height = '2000px';
		container.appendChild(this.content);
	}
	layout(width: number): void { this.lastWidth = width; }
	override setViewport(viewport: ICustomViewViewport): void {
		this.viewport = viewport;
		this.updates.fire(viewport);
	}
}

suite('Custom view viewport', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('the host reports its scroll viewport and owns programmatic scrolling', async () => {
		const instantiation = store.add(new TestInstantiationService());
		let view: ViewportTestView | undefined;
		const node = store.add(instantiation.createInstance(CustomViewNode, {
			id: 'test.viewport', ctor: new SyncDescriptor(ViewportTestView, [(created: ViewportTestView) => { view = created; }]),
		}));
		node.element.style.width = '900px';
		node.element.style.height = '700px';
		document.body.appendChild(node.element);
		store.add(toDisposable(() => node.element.remove()));
		node.layout(900, 700);
		assert.ok(view);
		const initial = view.viewport!;
		const updated = new Promise<ICustomViewViewport>(resolve => store.add(Event.once(view!.updates.event)(resolve)));
		initial.scrollBy(200);
		const scrolled = await updated;
		assert.deepStrictEqual({
			width: view.lastWidth,
			boundedHeight: initial.height > 0 && initial.height < 700,
			scrolled: Math.round(scrolled.top - initial.top),
			sameHeight: scrolled.height === initial.height,
		}, { width: 500, boundedHeight: true, scrolled: 200, sameHeight: true });
		assert.throws(() => scrolled.scrollBy(NaN), /Invalid custom view scroll delta/);
	});
});
