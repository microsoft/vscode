/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ActionsOrientation } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { IViewSize } from '../../../../../base/browser/ui/grid/grid.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { ActivitybarPart, ActivityBarCompositeBar } from '../../../../browser/parts/activitybar/activitybarPart.js';
import { GlobalCompositeBar } from '../../../../browser/parts/globalCompositeBar.js';
import { Extensions, PaneCompositeDescriptor } from '../../../../browser/panecomposite.js';
import { IPaneCompositeBarOptions } from '../../../../browser/parts/paneCompositeBar.js';
import { IPaneCompositePart } from '../../../../browser/parts/paneCompositePart.js';
import { IPaneComposite } from '../../../../common/panecomposite.js';
import { ViewContainerLocation } from '../../../../common/views.js';
import { Parts } from '../../../../services/layout/browser/layoutService.js';
import { TestStorageService } from '../../../common/workbenchTestServices.js';
import { TestLayoutService } from '../../workbenchTestServices.js';

interface ILayoutTestHarness {
	menuBarContainer: HTMLElement | undefined;
	globalCompositeBar: { element: HTMLElement; getHeight(actionHeight: number, actionGap: number): number } | undefined;
	globalActivities: { actionHeight: number; actionGap: number } | undefined;
	lastLayoutDimensions?: Dimension;
	options: { orientation: ActionsOrientation };
	compositeBar: { layout: (dimension: Dimension) => void };
}

const activityBarCompositeBarLayout = Reflect.get(ActivityBarCompositeBar.prototype, 'layout') as (this: ILayoutTestHarness, width: number, height: number) => void;

class StubPaneCompositePart implements IPaneCompositePart {
	declare readonly _serviceBrand: undefined;
	readonly partId = Parts.SIDEBAR_PART;
	readonly registryId = Extensions.Viewlets;
	element: HTMLElement = undefined!;
	minimumWidth = 0;
	maximumWidth = 0;
	minimumHeight = 0;
	maximumHeight = 0;
	onDidChange = Event.None;
	onDidPaneCompositeOpen = new Emitter<IPaneComposite>().event;
	onDidPaneCompositeClose = new Emitter<IPaneComposite>().event;
	openPaneComposite(): Promise<IPaneComposite | undefined> { return Promise.resolve(undefined); }
	getPaneComposites(): PaneCompositeDescriptor[] { return []; }
	getPaneComposite(): PaneCompositeDescriptor | undefined { return undefined; }
	getActivePaneComposite(): IPaneComposite | undefined { return undefined; }
	getProgressIndicator() { return undefined; }
	hideActivePaneComposite(): void { }
	getLastActivePaneCompositeId(): string { return ''; }
	getPinnedPaneCompositeIds(): string[] { return []; }
	getVisiblePaneCompositeIds(): string[] { return []; }
	getPaneCompositeIds(): string[] { return []; }
	layout(): void { }
	dispose(): void { }
}

suite('ActivitybarPart', () => {
	const disposables = new DisposableStore();

	function createActivitybarPart(instantiationService?: IInstantiationService): ActivitybarPart {
		const layoutService = new TestLayoutService();
		layoutService.isVisible = () => false;
		const stubInstantiationService = instantiationService ?? { createInstance: () => { throw new Error('not expected'); } } as unknown as IInstantiationService;
		return disposables.add(new ActivitybarPart(
			ViewContainerLocation.Sidebar,
			new StubPaneCompositePart(),
			stubInstantiationService,
			layoutService,
			new TestThemeService(),
			disposables.add(new TestStorageService()),
		));
	}

	test('uses the classic dimensions', () => {
		const part = createActivitybarPart();
		assert.deepStrictEqual({
			width: ActivitybarPart.ACTIVITYBAR_WIDTH,
			actionHeight: ActivitybarPart.ACTION_HEIGHT,
			iconSize: ActivitybarPart.ICON_SIZE,
			minimumWidth: part.minimumWidth,
			maximumWidth: part.maximumWidth,
			minimumHeight: part.minimumHeight,
			maximumHeight: part.maximumHeight,
		}, {
			width: 48,
			actionHeight: 48,
			iconSize: 24,
			minimumWidth: 48,
			maximumWidth: 48,
			minimumHeight: 0,
			maximumHeight: Number.POSITIVE_INFINITY,
		});
	});

	test('serializes as the activity bar part', () => {
		assert.deepStrictEqual(createActivitybarPart().toJSON(), { type: Parts.ACTIVITYBAR_PART });
	});

	test('uses the classic action height for composite and global activities', () => {
		let options: IPaneCompositeBarOptions | undefined;
		let globalActivities: { actionHeight: number; actionGap: number } | undefined;
		const stubCompositeBar = { create: () => { }, layout: () => { }, dispose: () => { } };
		const part = createActivitybarPart({
			createInstance: (_descriptor: typeof ActivityBarCompositeBar, _location: ViewContainerLocation, capturedOptions: IPaneCompositeBarOptions, _part: Parts, _paneCompositePart: IPaneCompositePart, capturedGlobalActivities: { actionHeight: number; actionGap: number }) => {
				options = capturedOptions;
				globalActivities = capturedGlobalActivities;
				return stubCompositeBar;
			}
		} as unknown as IInstantiationService);
		const element = document.createElement('div');
		part.create(element);
		part.show();

		assert.deepStrictEqual({
			compositeSize: options?.compositeSize,
			overflowActionSize: options?.overflowActionSize,
			globalActivities,
		}, {
			compositeSize: 48,
			overflowActionSize: 48,
			globalActivities: { actionHeight: 48, actionGap: 0 },
		});
	});

	function heightLeftForCompositeBar(globalActionCount: number, itemHeight: number, gap: number): number {
		const globalBarElement = document.createElement('div');
		Object.defineProperty(globalBarElement, 'clientHeight', { get: () => { throw new Error('Layout must not measure global activities'); } });
		const globalCompositeBar = {
			element: globalBarElement,
			globalActivityActionBar: { length: () => globalActionCount },
			getHeight: GlobalCompositeBar.prototype.getHeight,
		};
		let laidOut: Dimension | undefined;
		activityBarCompositeBarLayout.call({
			menuBarContainer: undefined,
			globalCompositeBar,
			globalActivities: { actionHeight: itemHeight, actionGap: gap },
			options: { orientation: ActionsOrientation.VERTICAL },
			compositeBar: { layout: dimension => { laidOut = dimension; } },
		}, ActivitybarPart.ACTIVITYBAR_WIDTH, 300);
		return laidOut!.height;
	}

	test('reserves global activity sizes without synchronous DOM measurement', () => {
		assert.strictEqual(heightLeftForCompositeBar(2, 48, 0), 204);
	});

	test('horizontal composite bars preserve compact menu space without global activities', () => {
		const menuBarContainer = document.createElement('div');
		Object.defineProperty(menuBarContainer, 'clientWidth', { get: () => 35 });
		let laidOut: IViewSize | undefined;
		activityBarCompositeBarLayout.call({
			menuBarContainer,
			globalCompositeBar: undefined,
			globalActivities: undefined,
			options: { orientation: ActionsOrientation.HORIZONTAL },
			compositeBar: { layout: dimension => { laidOut = dimension; } },
		}, 300, 35);
		assert.deepStrictEqual(laidOut, new Dimension(265, 35));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();
});
