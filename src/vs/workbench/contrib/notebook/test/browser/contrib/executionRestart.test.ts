/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IExtensionService, WillStopExtensionHostsEvent } from '../../../../../services/extensions/common/extensions.js';
import { NotebookExecutionRestartVeto } from '../../../browser/contrib/executionRestart/notebookExecutionRestart.js';
import { INotebookExecutionStateService } from '../../../common/notebookExecutionStateService.js';
import { TestNotebookExecutionStateService } from '../testNotebookEditor.js';

suite('NotebookExecutionRestartVeto', () => {

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let extensionService: MockExtensionService;
	let executionStateService: TestNotebookExecutionStateService;

	class MockExtensionService extends mock<IExtensionService>() {
		private readonly _onWillStop = new Emitter<WillStopExtensionHostsEvent>();
		override readonly onWillStop = this._onWillStop.event;

		fireWillStop(reason: string): boolean {
			let vetoed = false;
			const evt: WillStopExtensionHostsEvent = {
				reason,
				auto: false,
				veto: (value: boolean | Promise<boolean>, reason: string) => {
					if (value === true || (value as Promise<boolean>).then) {
						vetoed = true;
					}
				}
			};
			this._onWillStop.fire(evt);
			return vetoed;
		}
	}

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = disposables.add(new TestInstantiationService());
		
		extensionService = new MockExtensionService();
		instantiationService.stub(IExtensionService, extensionService);
		
		executionStateService = new TestNotebookExecutionStateService();
		instantiationService.stub(INotebookExecutionStateService, executionStateService);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should veto extension host restart when notebook cell is running', () => {
		// Create the veto contribution
		disposables.add(instantiationService.createInstance(NotebookExecutionRestartVeto));

		// Create a fake execution
		const notebookUri = URI.parse('notebook://test.ipynb');
		executionStateService.createCellExecution(notebookUri, 0);

		// Fire the will stop event
		const vetoed = extensionService.fireWillStop('test reason');

		// Should be vetoed because there's a running execution
		assert.strictEqual(vetoed, true);
	});

	test('should not veto extension host restart when no notebook cell is running', () => {
		// Create the veto contribution
		disposables.add(instantiationService.createInstance(NotebookExecutionRestartVeto));

		// Fire the will stop event without any running executions
		const vetoed = extensionService.fireWillStop('test reason');

		// Should not be vetoed because there are no running executions
		assert.strictEqual(vetoed, false);
	});

	test('should not veto after execution completes', () => {
		// Create the veto contribution
		disposables.add(instantiationService.createInstance(NotebookExecutionRestartVeto));

		// Create a fake execution
		const notebookUri = URI.parse('notebook://test.ipynb');
		const execution = executionStateService.createCellExecution(notebookUri, 0);

		// Complete the execution
		execution.complete({});

		// Fire the will stop event
		const vetoed = extensionService.fireWillStop('test reason');

		// Should not be vetoed because the execution completed
		assert.strictEqual(vetoed, false);
	});
});
