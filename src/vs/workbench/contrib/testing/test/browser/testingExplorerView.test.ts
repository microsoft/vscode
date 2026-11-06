/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { IManagedHoverContentOrFactory } from '../../../../../base/browser/ui/hover/hover.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { isDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ResolutionResult, ResultKind } from '../../../../../platform/keybinding/common/keybindingResolver.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { IActivityService } from '../../../../services/activity/common/activity.js';
import { IViewContainerModel, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestingExplorerView } from '../../browser/testingExplorerView.js';
import { TestingExplorerFilter } from '../../browser/testingExplorerFilter.js';
import { TreeProjection } from '../../browser/explorerProjections/treeProjection.js';
import { Testing } from '../../common/constants.js';
import { TestExclusions } from '../../common/testExclusions.js';
import { ITestExplorerFilterState, TestExplorerFilterState } from '../../common/testExplorerFilterState.js';
import { ITestProfileService } from '../../common/testProfileService.js';
import { TestResultItemChange, TestResultItemChangeReason } from '../../common/testResult.js';
import { ITestResultService } from '../../common/testResultService.js';
import { ITestService } from '../../common/testService.js';
import { TestResultItem, TestResultState } from '../../common/testTypes.js';
import { ITestingContinuousRunService } from '../../common/testingContinuousRunService.js';
import { ITestingPeekOpener } from '../../common/testingPeekOpener.js';
import { getInitializedMainTestCollection } from '../common/testStubs.js';

suite('TestingExplorerView', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	async function createView(resolution: ResolutionResult, { filterText = 'existing-filter', hoverService = NullHoverService } = {}) {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IHoverService, hoverService);
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService(false));
		instantiationService.stub(IKeybindingService, new class extends MockKeybindingService {
			override softDispatch(): ResolutionResult { return resolution; }
		}());
		const container = upcastPartial<ViewContainer>({ id: Testing.ExplorerViewId });
		instantiationService.stub(IViewDescriptorService, {
			onDidChangeLocation: Event.None,
			getViewLocationById: () => ViewContainerLocation.Sidebar,
			getViewDescriptorById: () => null,
			getViewContainerByViewId: () => container,
			getDefaultContainerById: () => container,
			getViewContainerModel: () => upcastPartial<IViewContainerModel>({ onDidChangeContainerInfo: Event.None }),
		});
		instantiationService.stub(IActivityService, {});
		instantiationService.stub(ITestService, {
			collection: await getInitializedMainTestCollection(),
			excluded: disposables.add(instantiationService.createInstance(TestExclusions)),
			onWillProcessDiff: Event.None,
			onDidProcessDiff: Event.None,
			getTestController: () => undefined,
		});
		instantiationService.stub(ITestProfileService, {
			onDidChange: Event.None,
			all: () => [],
			capabilitiesForTest: () => 0,
			getGroupDefaultProfiles: () => [],
		});
		const onTestChanged = disposables.add(new Emitter<TestResultItemChange>());
		instantiationService.stub(ITestResultService, {
			results: [],
			onResultsChanged: Event.None,
			onTestChanged: onTestChanged.event,
			getStateById: () => undefined,
		});
		instantiationService.stub(ITestingContinuousRunService, {
			onDidChange: Event.None,
			isEnabled: () => false,
			isSpecificallyEnabledFor: () => false,
			isEnabledForAParentOf: () => false,
			isEnabledForAChildOf: () => false,
		});
		instantiationService.stub(ITestingPeekOpener, {});
		const filterState = disposables.add(instantiationService.createInstance(TestExplorerFilterState));
		filterState.setText(filterText);
		instantiationService.stub(ITestExplorerFilterState, filterState);
		const projection = disposables.add(instantiationService.createInstance(TreeProjection, {}));
		instantiationService.stubInstance(TreeProjection, projection);
		const subscriptions = sinon.spy(projection, 'onUpdate');
		const instances = sinon.spy(instantiationService, 'createInstance');
		const view = disposables.add(instantiationService.createInstance(TestingExplorerView, { id: Testing.ExplorerViewId, title: 'Testing' }));
		disposables.add(toDisposable(() => view.element.remove()));
		document.body.appendChild(view.element);
		view.render();
		view.setVisible(true);
		view.orthogonalSize = 400;
		view.layout(600);
		for (const instance of instances.returnValues) {
			if (isDisposable(instance)) {
				disposables.add(instance);
			}
			if (instance instanceof TestingExplorerFilter) {
				if (isDisposable(instance.action)) {
					disposables.add(instance.action);
				}
				// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Own the fixture's filter action without adding a production API.
				disposables.add(instance['filtersAction']);
			}
		}
		for (const subscription of subscriptions.returnValues) {
			disposables.add(subscription);
		}
		view.viewModel.tree.domFocus();
		return { view, filterState, projection, onTestChanged };
	}

	for (const key of ['j', 'k', 'o']) {
		test(`preserves tree focus for a matching ${key} shortcut`, async () => {
			const { view, filterState } = await createView({ kind: ResultKind.KbFound, commandId: 'list.focusDown', commandArgs: undefined, isBubble: false });
			view.viewModel.tree.getHTMLElement().dispatchEvent(new KeyboardEvent('keydown', { key, code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0), bubbles: true }));
			assert.deepStrictEqual({ text: filterState.text.value, treeFocused: view.viewModel.tree.isDOMFocused() }, { text: 'existing-filter', treeFocused: true });
		});
	}

	test('preserves tree focus for a shortcut chord prefix', async () => {
		const { view, filterState } = await createView({ kind: ResultKind.MoreChordsNeeded });
		view.viewModel.tree.getHTMLElement().dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', keyCode: 74, bubbles: true }));
		assert.deepStrictEqual({ text: filterState.text.value, treeFocused: view.viewModel.tree.isDOMFocused() }, { text: 'existing-filter', treeFocused: true });
	});

	test('starts filtering for an unbound printable key', async () => {
		const { view, filterState } = await createView({ kind: ResultKind.NoMatchingKb });
		view.viewModel.tree.getHTMLElement().dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', keyCode: 90, bubbles: true }));
		assert.deepStrictEqual({ text: filterState.text.value, treeFocused: view.viewModel.tree.isDOMFocused() }, { text: 'z', treeFocused: false });
	});

	test('batches state updates without replacing the row hover', async () => {
		const hovers: { target: HTMLElement; content: IManagedHoverContentOrFactory; disposed: boolean; updates: number }[] = [];
		const hoverService: IHoverService = {
			...NullHoverService,
			setupManagedHover: (_delegate, target, content) => {
				const hover = { target, content, disposed: false, updates: 0 };
				hovers.push(hover);
				return {
					show: () => { },
					hide: () => { },
					update: content => { hover.content = content; hover.updates++; },
					dispose: () => { hover.disposed = true; },
				};
			},
		};
		const { view, projection, onTestChanged } = await createView({ kind: ResultKind.NoMatchingKb }, { filterText: '', hoverService });
		const element = projection.getElementByTestId('ctrlId\0id-b')!;
		const label = Array.from(view.viewModel.tree.getHTMLElement().querySelectorAll<HTMLElement>('.label')).find(label => label.textContent === 'b');
		assert.ok(label);
		const initialHover = hovers.find(hover => hover.target === label)!;
		const initialUpdates = initialHover.updates;
		const item: TestResultItem = {
			...element.test,
			tasks: [],
			ownComputedState: TestResultState.Running,
			computedState: TestResultState.Running,
		};

		const updateDuration = (duration: number) => {
			const previousOwnDuration = item.ownDuration;
			item.ownDuration = duration;
			onTestChanged.fire({
				reason: TestResultItemChangeReason.OwnStateChange,
				result: undefined!,
				item,
				previousState: TestResultState.Running,
				previousOwnDuration,
			});
		};
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			updateDuration(1);
			updateDuration(2);
			assert.strictEqual(initialHover.updates, initialUpdates);
			clock.tick(0);

			const rowHovers = hovers.filter(hover => hover.target === label);
			assert.deepStrictEqual({ count: rowHovers.length, active: rowHovers.filter(hover => !hover.disposed).length, updates: initialHover.updates - initialUpdates, content: rowHovers.at(-1)?.content }, { count: 1, active: 1, updates: 1, content: 'b (Running), in 2.0ms' });
			element.test.item.label = 'renamed';
			view.viewModel.tree.rerender(element);
			assert.deepStrictEqual({ count: hovers.filter(hover => hover.target === label).length, content: rowHovers[0].content }, { count: 1, content: 'renamed (Running), in 2.0ms' });
			const updatesBeforeDispose = initialHover.updates;
			updateDuration(3);
			view.dispose();
			clock.tick(0);
			assert.deepStrictEqual({ disposed: initialHover.disposed, updates: initialHover.updates }, { disposed: true, updates: updatesBeforeDispose });
		} finally {
			clock.restore();
		}
	});
});
