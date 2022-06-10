/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IEditorControl } from 'vs/workbench/common/editor';
import { CompositeProgressScope, CompositeProgressIndicator } from 'vs/workbench/services/progress/browser/progressIndicator';
import { TestSideBarPart, TestViewsService, TestPaneCompositeService } from 'vs/workbench/test/browser/workbenchTestServices';
import { Event } from 'vs/base/common/event';
import { IView, IViewPaneContainer, ViewContainerLocation } from 'vs/workbench/common/views';
import { IPaneComposite } from 'vs/workbench/common/panecomposite';

class TestViewlet implements IPaneComposite {

	constructor(private id: string) { }

	readonly onDidBlur = Event.None;
	readonly onDidFocus = Event.None;

	hasFocus() { return false; }
	getId(): string { return this.id; }
	getTitle(): string { return this.id; }
	getControl(): IEditorControl { return null!; }
	focus(): void { }
	getOptimalWidth(): number { return 10; }
	openView<T extends IView>(id: string, focus?: boolean): T | undefined { return undefined; }
	getViewPaneContainer(): IViewPaneContainer { return null!; }
	saveState(): void { }
}

class TestProgressBar {
	fTotal: number = 0;
	fWorked: number = 0;
	fInfinite: boolean = false;
	fDone: boolean = false;

	infinite() {
		this.fDone = null!;
		this.fInfinite = true;

		return this;
	}

	total(total: number) {
		this.fDone = null!;
		this.fTotal = total;

		return this;
	}

	hasTotal() {
		return !!this.fTotal;
	}

	worked(worked: number) {
		this.fDone = null!;

		if (this.fWorked) {
			this.fWorked += worked;
		} else {
			this.fWorked = worked;
		}

		return this;
	}

	done() {
		this.fDone = true;

		this.fInfinite = null!;
		this.fWorked = null!;
		this.fTotal = null!;

		return this;
	}

	stop() {
		return this.done();
	}

	show(): void { }

	hide(): void { }
}

suite('Progress Indicator', () => {

	test('CompositeScope', () => {
		const paneCompositeService = new TestPaneCompositeService();
		const viewsService = new TestViewsService();
		const service = new CompositeProgressScope(paneCompositeService, viewsService, 'test.scopeId', false);
		const testViewlet = new TestViewlet('test.scopeId');

		assert(!service.isActive);
		(paneCompositeService.getPartByLocation(ViewContainerLocation.Sidebar) as TestSideBarPart).onDidViewletOpenEmitter.fire(testViewlet);
		assert(service.isActive);

		(paneCompositeService.getPartByLocation(ViewContainerLocation.Sidebar) as TestSideBarPart).onDidViewletCloseEmitter.fire(testViewlet);
		assert(!service.isActive);

		viewsService.onDidChangeViewVisibilityEmitter.fire({ id: 'test.scopeId', visible: true });
		assert(service.isActive);

		viewsService.onDidChangeViewVisibilityEmitter.fire({ id: 'test.scopeId', visible: false });
		assert(!service.isActive);
	});

	test('CompositeProgressIndicator', async () => {
		const testProgressBar = new TestProgressBar();
		const paneCompositeService = new TestPaneCompositeService();
		const viewsService = new TestViewsService();
		const service = new CompositeProgressIndicator((<any>testProgressBar), 'test.scopeId', true, paneCompositeService, viewsService);

		// Active: Show (Infinite)
		let fn = service.show(true);
		assert.strictEqual(true, testProgressBar.fInfinite);
		fn.done();
		assert.strictEqual(true, testProgressBar.fDone);

		// Active: Show (Total / Worked)
		fn = service.show(100);
		assert.strictEqual(false, !!testProgressBar.fInfinite);
		assert.strictEqual(100, testProgressBar.fTotal);
		fn.worked(20);
		assert.strictEqual(20, testProgressBar.fWorked);
		fn.total(80);
		assert.strictEqual(80, testProgressBar.fTotal);
		fn.done();
		assert.strictEqual(true, testProgressBar.fDone);

		// Inactive: Show (Infinite)
		const testViewlet = new TestViewlet('test.scopeId');
		(paneCompositeService.getPartByLocation(ViewContainerLocation.Sidebar) as TestSideBarPart).onDidViewletCloseEmitter.fire(testViewlet);
		service.show(true);
		assert.strictEqual(false, !!testProgressBar.fInfinite);
		(paneCompositeService.getPartByLocation(ViewContainerLocation.Sidebar) as TestSideBarPart).onDidViewletOpenEmitter.fire(testViewlet);
		assert.strictEqual(true, testProgressBar.fInfinite);

		// Inactive: Show (Total / Worked)
		(paneCompositeService.getPartByLocation(ViewContainerLocation.Sidebar) as TestSideBarPart).onDidViewletCloseEmitter.fire(testViewlet);
		fn = service.show(100);
		fn.total(80);
		fn.worked(20);
		assert.strictEqual(false, !!testProgressBar.fTotal);
		(paneCompositeService.getPartByLocation(ViewContainerLocation.Sidebar) as TestSideBarPart).onDidViewletOpenEmitter.fire(testViewlet);
		assert.strictEqual(20, testProgressBar.fWorked);
		assert.strictEqual(80, testProgressBar.fTotal);

		// Acive: Show While
		let p = Promise.resolve(null);
		await service.showWhile(p);
		assert.strictEqual(true, testProgressBar.fDone);
		(paneCompositeService.getPartByLocation(ViewContainerLocation.Sidebar) as TestSideBarPart).onDidViewletCloseEmitter.fire(testViewlet);
		p = Promise.resolve(null);
		await service.showWhile(p);
		assert.strictEqual(true, testProgressBar.fDone);
		(paneCompositeService.getPartByLocation(ViewContainerLocation.Sidebar) as TestSideBarPart).onDidViewletOpenEmitter.fire(testViewlet);
		assert.strictEqual(true, testProgressBar.fDone);

		// Visible view: Show (Infinite)
		viewsService.onDidChangeViewVisibilityEmitter.fire({ id: 'test.scopeId', visible: true });
		fn = service.show(true);
		assert.strictEqual(true, testProgressBar.fInfinite);
		fn.done();
		assert.strictEqual(true, testProgressBar.fDone);

		// Hidden view: Show (Infinite)
		viewsService.onDidChangeViewVisibilityEmitter.fire({ id: 'test.scopeId', visible: false });
		service.show(true);
		assert.strictEqual(false, !!testProgressBar.fInfinite);
		viewsService.onDidChangeViewVisibilityEmitter.fire({ id: 'test.scopeId', visible: true });
		assert.strictEqual(true, testProgressBar.fInfinite);
	});
});
