/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IAction, IActionItem } from 'vs/base/common/actions';
import { IEditorControl } from 'vs/workbench/common/editor';
import { Viewlet, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { IPanel } from 'vs/workbench/common/panel';
import { ScopedProgressService, ScopedService } from 'vs/workbench/services/progress/browser/progressService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { Emitter } from 'vs/base/common/event';

let activeViewlet: Viewlet = {} as any;

class TestViewletService implements IViewletService {
	public _serviceBrand: any;

	onDidViewletRegisterEmitter = new Emitter<ViewletDescriptor>();
	onDidViewletOpenEmitter = new Emitter<IViewlet>();
	onDidViewletCloseEmitter = new Emitter<IViewlet>();
	onDidViewletEnableEmitter = new Emitter<{ id: string, enabled: boolean }>();

	onDidViewletRegister = this.onDidViewletRegisterEmitter.event;
	onDidViewletOpen = this.onDidViewletOpenEmitter.event;
	onDidViewletClose = this.onDidViewletCloseEmitter.event;
	onDidViewletEnablementChange = this.onDidViewletEnableEmitter.event;

	public openViewlet(id: string, focus?: boolean): Promise<IViewlet> {
		return Promise.resolve(null!);
	}

	public getViewlets(): ViewletDescriptor[] {
		return [];
	}

	public getAllViewlets(): ViewletDescriptor[] {
		return [];
	}

	public getActiveViewlet(): IViewlet {
		return activeViewlet;
	}
	public setViewletEnablement(id: string, enabled: boolean): void { }

	public dispose() {
	}

	public getDefaultViewletId(): string {
		return 'workbench.view.explorer';
	}

	public getViewlet(id: string): ViewletDescriptor {
		return null!;
	}

	public getProgressIndicator(id: string) {
		return null!;
	}
}

class TestPanelService implements IPanelService {
	public _serviceBrand: any;

	onDidPanelOpen = new Emitter<{ panel: IPanel, focus: boolean }>().event;
	onDidPanelClose = new Emitter<IPanel>().event;

	public openPanel(id: string, focus?: boolean): IPanel {
		return null!;
	}

	public getPanels(): any[] {
		return [];
	}

	public getPinnedPanels(): any[] {
		return [];
	}

	public getActivePanel(): IViewlet {
		return activeViewlet;
	}

	public setPanelEnablement(id: string, enabled: boolean): void { }

	public dispose() {
	}
}

class TestViewlet implements IViewlet {

	constructor(private id: string) { }

	getId(): string {
		return this.id;
	}

	/**
	 * Returns the name of this composite to show in the title area.
	 */
	getTitle(): string {
		return this.id;
	}

	/**
	 * Returns the primary actions of the composite.
	 */
	getActions(): IAction[] {
		return [];
	}

	/**
	 * Returns the secondary actions of the composite.
	 */
	getSecondaryActions(): IAction[] {
		return [];
	}

	/**
	 * Returns an array of actions to show in the context menu of the composite
	 */
	public getContextMenuActions(): IAction[] {
		return [];
	}

	/**
	 * Returns the action item for a specific action.
	 */
	getActionItem(action: IAction): IActionItem {
		return null!;
	}

	/**
	 * Returns the underlying control of this composite.
	 */
	getControl(): IEditorControl {
		return null!;
	}

	/**
	 * Asks the underlying control to focus.
	 */
	focus(): void {
	}

	getOptimalWidth(): number {
		return 10;
	}
}

class TestScopedService extends ScopedService {
	public isActive: boolean;

	constructor(viewletService: IViewletService, panelService: IPanelService, scopeId: string) {
		super(viewletService, panelService, scopeId);
	}
	public onScopeActivated() {
		this.isActive = true;
	}

	public onScopeDeactivated() {
		this.isActive = false;
	}
}

class TestProgressBar {
	public fTotal: number;
	public fWorked: number;
	public fInfinite: boolean;
	public fDone: boolean;

	constructor() {
	}

	public infinite() {
		this.fDone = null!;
		this.fInfinite = true;

		return this;
	}

	public total(total: number) {
		this.fDone = null!;
		this.fTotal = total;

		return this;
	}

	public hasTotal() {
		return !!this.fTotal;
	}

	public worked(worked: number) {
		this.fDone = null!;

		if (this.fWorked) {
			this.fWorked += worked;
		} else {
			this.fWorked = worked;
		}

		return this;
	}

	public done() {
		this.fDone = true;

		this.fInfinite = null!;
		this.fWorked = null!;
		this.fTotal = null!;

		return this;
	}

	public stop() {
		return this.done();
	}

	public show(): void {

	}

	public hide(): void {

	}
}

suite('Progress Service', () => {

	test('ScopedService', () => {
		let viewletService = new TestViewletService();
		let panelService = new TestPanelService();
		let service = new TestScopedService(viewletService, panelService, 'test.scopeId');
		const testViewlet = new TestViewlet('test.scopeId');

		assert(!service.isActive);
		viewletService.onDidViewletOpenEmitter.fire(testViewlet);
		assert(service.isActive);

		viewletService.onDidViewletCloseEmitter.fire(testViewlet);
		assert(!service.isActive);

	});

	test('WorkbenchProgressService', async () => {
		let testProgressBar = new TestProgressBar();
		let viewletService = new TestViewletService();
		let panelService = new TestPanelService();
		let service = new ScopedProgressService((<any>testProgressBar), 'test.scopeId', true, viewletService, panelService);

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
		viewletService.onDidViewletCloseEmitter.fire(testViewlet);
		service.show(true);
		assert.strictEqual(false, !!testProgressBar.fInfinite);
		viewletService.onDidViewletOpenEmitter.fire(testViewlet);
		assert.strictEqual(true, testProgressBar.fInfinite);

		// Inactive: Show (Total / Worked)
		viewletService.onDidViewletCloseEmitter.fire(testViewlet);
		fn = service.show(100);
		fn.total(80);
		fn.worked(20);
		assert.strictEqual(false, !!testProgressBar.fTotal);
		viewletService.onDidViewletOpenEmitter.fire(testViewlet);
		assert.strictEqual(20, testProgressBar.fWorked);
		assert.strictEqual(80, testProgressBar.fTotal);

		// Acive: Show While
		let p = Promise.resolve(null);
		await service.showWhile(p);
		assert.strictEqual(true, testProgressBar.fDone);
		viewletService.onDidViewletCloseEmitter.fire(testViewlet);
		p = Promise.resolve(null);
		await service.showWhile(p);
		assert.strictEqual(true, testProgressBar.fDone);
		viewletService.onDidViewletOpenEmitter.fire(testViewlet);
		assert.strictEqual(true, testProgressBar.fDone);
	});
});
