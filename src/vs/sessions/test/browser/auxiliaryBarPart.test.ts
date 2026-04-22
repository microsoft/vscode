/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { TestLayoutService, workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { AuxiliaryBarPart } from '../../browser/parts/auxiliaryBarPart.js';

class MutableTestLayoutService extends TestLayoutService {

	private readonly _visibleParts = new Map<Parts, boolean>([
		[Parts.AUXILIARYBAR_PART, true],
		[Parts.EDITOR_PART, false],
	]);

	private readonly _onDidChangePartVisibility = new Emitter<IPartVisibilityChangeEvent>();
	override readonly onDidChangePartVisibility = this._onDidChangePartVisibility.event;

	override isVisible(part: Parts, _targetWindow?: Window): boolean {
		return this._visibleParts.get(part) ?? false;
	}

	setVisible(part: Parts, visible: boolean): void {
		this._visibleParts.set(part, visible);
		this._onDidChangePartVisibility.fire({ partId: part, visible });
	}

	dispose(): void {
		this._onDidChangePartVisibility.dispose();
	}
}

suite('Sessions - Auxiliary Bar Part', () => {
	const disposables = new DisposableStore();

	let instantiationService: TestInstantiationService;
	let layoutService: MutableTestLayoutService;
	let auxiliaryBarPart: AuxiliaryBarPart;

	setup(() => {
		layoutService = new MutableTestLayoutService();
		instantiationService = workbenchInstantiationService({}, disposables);
		instantiationService.stub(IWorkbenchLayoutService, layoutService as IWorkbenchLayoutService);
		auxiliaryBarPart = disposables.add(instantiationService.createInstance(AuxiliaryBarPart));
	});

	teardown(() => {
		layoutService.dispose();
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the default minimum width and disables sash snap when the editor part is visible', () => {
		layoutService.setVisible(Parts.EDITOR_PART, true);

		assert.strictEqual(auxiliaryBarPart.minimumWidth, 270);
		assert.strictEqual(auxiliaryBarPart.snap, false);
	});

	test('restores sash snap when the editor part is hidden', () => {
		layoutService.setVisible(Parts.EDITOR_PART, true);
		assert.strictEqual(auxiliaryBarPart.snap, false);

		layoutService.setVisible(Parts.EDITOR_PART, false);
		assert.strictEqual(auxiliaryBarPart.snap, true);
	});
});
