/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../base/browser/dom.js';
import { IBoundarySashes } from '../../../../base/browser/ui/sash/sash.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConstructorSignature, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockKeybindingService } from '../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
import { Composite, CompositeDescriptor, CompositeRegistry } from '../../../browser/composite.js';
import { CompositePart } from '../../../browser/parts/compositePart.js';
import { NullHoverService } from '../../../../platform/hover/test/browser/nullHoverService.js';
import { TestLayoutService } from '../workbenchTestServices.js';
import { TestStorageService } from '../../common/workbenchTestServices.js';

class TestComposite extends Composite {

	static readonly ID = 'testComposite';

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
	) {
		super(TestComposite.ID, telemetryService, themeService, storageService);
	}

	layout(_dimension: Dimension): void { }
	setBoundarySashes(_sashes: IBoundarySashes): void { }
}

class TestCompositeDescriptor extends CompositeDescriptor<TestComposite> {

	constructor() {
		super(TestComposite as IConstructorSignature<TestComposite>, TestComposite.ID, 'Test Composite');
	}
}

class TestCompositeRegistry extends CompositeRegistry<TestComposite> {

	register(descriptor: CompositeDescriptor<TestComposite>): void {
		this.registerComposite(descriptor);
	}
}

class TestCompositePart extends CompositePart<TestComposite> {

	readonly minimumWidth = 0;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	readonly minimumHeight = 0;
	readonly maximumHeight = Number.POSITIVE_INFINITY;

	constructor(
		instantiationService: IInstantiationService,
		registry: CompositeRegistry<TestComposite>,
		storageService: IStorageService,
		themeService: IThemeService,
		layoutService: TestLayoutService,
	) {
		super(
			new TestNotificationService(),
			storageService,
			{} as IContextMenuService,
			layoutService,
			new MockKeybindingService(),
			NullHoverService,
			instantiationService,
			themeService,
			registry,
			'test.activeComposite',
			TestComposite.ID,
			'test',
			'test-composite',
			undefined,
			undefined,
			'testCompositePart',
			{ hasTitle: false },
		);
	}

	createTestComposite(): TestComposite {
		return this.createComposite(TestComposite.ID);
	}

	removeTestComposite(): boolean {
		return this.removeComposite(TestComposite.ID);
	}

	hasCompositeOpenListeners(): boolean {
		return this.onDidCompositeOpen.hasListeners();
	}

	toJSON(): object {
		return {};
	}
}

suite('CompositePart', () => {

	const disposables = new DisposableStore();
	let fixture: HTMLElement;

	setup(() => {
		fixture = document.createElement('div');
		document.body.appendChild(fixture);
	});

	teardown(() => {
		fixture.remove();
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('removing a composite disposes its progress scope listeners', () => {
		const storageService = disposables.add(new TestStorageService());
		const themeService = new TestThemeService();
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
			[ITelemetryService, NullTelemetryService],
			[IThemeService, themeService],
			[IStorageService, storageService],
		)));
		const registry = disposables.add(new TestCompositeRegistry());
		registry.register(new TestCompositeDescriptor());
		const part = disposables.add(new TestCompositePart(
			instantiationService,
			registry,
			storageService,
			themeService,
			new TestLayoutService(),
		));
		part.create(fixture);

		part.createTestComposite();
		assert.strictEqual(part.hasCompositeOpenListeners(), true);

		assert.strictEqual(part.removeTestComposite(), true);
		assert.strictEqual(part.hasCompositeOpenListeners(), false);
	});
});
