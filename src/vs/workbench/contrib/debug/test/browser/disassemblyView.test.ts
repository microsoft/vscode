/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, Dimension } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { breakpoint, debugStackframe } from '../../browser/debugIcons.js';
import { DisassemblyView } from '../../browser/disassemblyView.js';
import { IDebugService, IDebugSession, IStackFrame, IThread, IViewModel, State } from '../../common/debug.js';
import { createMockDebugModel } from './mockDebugModel.js';

suite('Debug - Disassembly View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders and updates a breakpoint when reopened at a different instruction reference', async () => {
		const store = disposables.add(new DisposableStore());
		const model = createMockDebugModel(store);
		const previousReference = '0x1000';
		const currentReference = '0x1004';
		const address = BigInt(currentReference);
		const breakpointOptions = { instructionReference: previousReference, offset: 4, address, canPersist: false };
		model.addInstructionBreakpoint(breakpointOptions);

		const thread = upcastPartial<IThread>({ getTopStackFrame: (): IStackFrame => stackFrame });
		const stackFrame = upcastPartial<IStackFrame>({ thread, instructionPointerReference: currentReference });
		const session = upcastPartial<IDebugSession>({
			disassemble: async (reference, _offset, instructionOffset, instructionCount) => {
				if (reference !== currentReference) {
					return undefined;
				}
				return Array.from({ length: instructionCount }, (_, index) => {
					const offset = instructionOffset + index;
					return { address: offset === -1 ? previousReference : offset === 0 ? currentReference : '-1', instruction: 'nop' };
				});
			},
		});
		const viewModel = upcastPartial<IViewModel>({
			focusedSession: session,
			focusedStackFrame: stackFrame,
			onDidFocusStackFrame: Event.None,
		});
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({ debug: { disassemblyView: { showSourceCode: false } }, editor: {} }),
		}, store);
		instantiationService.stub(IListService, store.add(new ListService()));
		instantiationService.stub(IDebugService, upcastPartial<IDebugService>({
			state: State.Stopped,
			onDidChangeState: Event.None,
			getModel: () => model,
			getViewModel: () => viewModel,
		}));

		const container = mainWindow.document.body.appendChild($('div'));
		container.style.width = '500px';
		store.add(toDisposable(() => container.remove()));
		const view = store.add(instantiationService.createInstance(DisassemblyView, new TestEditorGroupView(0)));
		const focused = new DeferredPromise<void>();
		const observer = new mainWindow.MutationObserver(() => {
			observer.disconnect();
			focused.complete();
		});
		store.add(toDisposable(() => observer.disconnect()));
		observer.observe(container, { subtree: true, attributeFilter: ['aria-activedescendant'] });
		view.create(container);
		view.layout(new Dimension(500, 200));
		await focused.p;

		const icon = container.querySelector(ThemeIcon.asCSSSelector(debugStackframe));
		assert.ok(icon, 'The current instruction arrow should be rendered');
		assert.ok(icon.matches(ThemeIcon.asCSSSelector(breakpoint.regular)), 'The arrow should also show the existing breakpoint');

		model.setEnablement(model.getInstructionBreakpoints()[0], false);
		assert.ok(icon.matches(ThemeIcon.asCSSSelector(breakpoint.disabled)), 'Disabling the breakpoint should update the marker');

		model.removeInstructionBreakpoints(currentReference, 0, address);
		assert.ok(!icon.matches(ThemeIcon.asCSSSelector(breakpoint.disabled)), 'Removing the breakpoint should clear the marker');

		model.addInstructionBreakpoint(breakpointOptions);
		assert.ok(icon.matches(ThemeIcon.asCSSSelector(breakpoint.regular)), 'Adding a breakpoint should restore the marker');
	});
});
