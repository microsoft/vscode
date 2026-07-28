/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { TERMINAL_VIEW_ID } from '../../../../../workbench/contrib/terminal/common/terminal.js';
import { openNewSearchEditor } from '../../../../../workbench/contrib/searchEditor/browser/searchEditorActions.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { NewChangesTabAction, NewFileTabAction, NewSearchTabAction } from '../../browser/addTabActions.js';
import { EmptyFileEditorInput } from '../../browser/emptyFileEditorInput.js';

// Import editor contribution to trigger action registration.
import '../../browser/editor.contribution.js';

suite('Sessions - Editor Contribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function stubEditorGroupCount(instantiationService: TestInstantiationService, count: number): void {
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override get mainPart(): IEditorGroupsService['mainPart'] {
				return { activeGroup: { count } as IEditorGroup } as IEditorGroupsService['mainPart'];
			}
		});
	}

	test('new file tab action opens pinned empty file editor', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const opened: { editor: EditorInput; options: IEditorOptions | undefined }[] = [];
		stubEditorGroupCount(instantiationService, 7);
		instantiationService.set(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				const editor = args[0];
				if (editor instanceof EditorInput) {
					opened.push({ editor: store.add(editor), options: args[1] as IEditorOptions | undefined });
				}
				return undefined;
			}
		});

		await new NewFileTabAction().run(instantiationService);

		assert.deepStrictEqual(opened.map(({ editor, options }) => ({
			isEmptyFileEditor: editor instanceof EmptyFileEditorInput,
			pinned: options?.pinned,
			index: options?.index
		})), [{ isEmptyFileEditor: true, pinned: true, index: 7 }]);
	});

	test('new search tab action opens a new search editor', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const invoked: unknown[] = [];
		instantiationService.stub(IInstantiationService, new class extends mock<IInstantiationService>() {
			override invokeFunction<R, TS extends any[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ..._args: TS): R {
				invoked.push(fn);
				return undefined as R;
			}
		});

		await new NewSearchTabAction().run(instantiationService);

		assert.deepStrictEqual(invoked, [openNewSearchEditor]);
	});

	test('new changes tab action opens the changes editor for the active session', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const resource = URI.parse('session:1');
		stubEditorGroupCount(instantiationService, 5);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable({ resource } as IActiveSession);
		});
		const opened: { resource: URI; index: number | undefined }[] = [];
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override async openChangesEditor(sessionResource: URI, options?: IEditorOptions): Promise<undefined> {
				opened.push({ resource: sessionResource, index: options?.index });
				return undefined;
			}
		});

		await new NewChangesTabAction().run(instantiationService);

		assert.deepStrictEqual(opened, [{ resource, index: 5 }]);
	});

	test('new changes tab action is a no-op when there is no active session', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		stubEditorGroupCount(instantiationService, 0);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});
		let opened = false;
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override async openChangesEditor(): Promise<undefined> {
				opened = true;
				return undefined;
			}
		});

		await new NewChangesTabAction().run(instantiationService);

		assert.strictEqual(opened, false);
	});

	test('maximize editor hides the terminal panel before maximizing', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			readonly calls: string[] = [];
			readonly hiddenParts: Parts[] = [];
			editorMaximized = false;
			panelVisible = true;

			override isVisible(part: Parts): boolean {
				return part === Parts.PANEL_PART ? this.panelVisible : false;
			}

			override setPartHidden(hidden: boolean, part: Parts): void {
				if (part === Parts.PANEL_PART) {
					this.panelVisible = !hidden;
				}

				if (hidden && part === Parts.PANEL_PART) {
					this.calls.push('hidePanel');
					this.hiddenParts.push(part);
				}
			}

			override setEditorMaximized(maximized: boolean): void {
				this.calls.push(maximized ? 'maximizeEditor' : 'restoreEditor');
				this.editorMaximized = maximized;
			}
		};
		instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
		instantiationService.set(IViewsService, new class extends mock<IViewsService>() {
			override isViewVisible(id: string): boolean {
				return id === TERMINAL_VIEW_ID;
			}
		});

		const handler = CommandsRegistry.getCommand('workbench.action.agentSessions.maximizeMainEditorPart')?.handler;
		assert.ok(handler, 'Command handler should be registered');

		await handler(instantiationService);

		assert.deepStrictEqual(layoutService.calls, ['hidePanel', 'maximizeEditor']);
		assert.deepStrictEqual(layoutService.hiddenParts, [Parts.PANEL_PART]);
		assert.strictEqual(layoutService.editorMaximized, true);
	});

	test('maximize editor keeps non-terminal panels visible', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			readonly hiddenParts: Parts[] = [];
			editorMaximized = false;
			panelVisible = true;

			override isVisible(part: Parts): boolean {
				return part === Parts.PANEL_PART ? this.panelVisible : false;
			}

			override setPartHidden(hidden: boolean, part: Parts): void {
				if (part === Parts.PANEL_PART) {
					this.panelVisible = !hidden;
				}

				if (hidden && part === Parts.PANEL_PART) {
					this.hiddenParts.push(part);
				}
			}

			override setEditorMaximized(maximized: boolean): void {
				this.editorMaximized = maximized;
			}
		};
		instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
		instantiationService.set(IViewsService, new class extends mock<IViewsService>() {
			override isViewVisible(_id: string): boolean {
				return false;
			}
		});

		const handler = CommandsRegistry.getCommand('workbench.action.agentSessions.maximizeMainEditorPart')?.handler;
		assert.ok(handler, 'Command handler should be registered');

		await handler(instantiationService);

		assert.deepStrictEqual(layoutService.hiddenParts, []);
		assert.strictEqual(layoutService.editorMaximized, true);
	});

	test('restore editor reopens the terminal panel when maximize hid it', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			readonly hiddenParts: Parts[] = [];
			readonly shownParts: Parts[] = [];
			readonly maximizedStates: boolean[] = [];
			panelVisible = true;

			override isVisible(part: Parts): boolean {
				return part === Parts.PANEL_PART ? this.panelVisible : false;
			}

			override setPartHidden(hidden: boolean, part: Parts): void {
				if (part === Parts.PANEL_PART) {
					this.panelVisible = !hidden;
					if (hidden) {
						this.hiddenParts.push(part);
					} else {
						this.shownParts.push(part);
					}
				}
			}

			override setEditorMaximized(maximized: boolean): void {
				this.maximizedStates.push(maximized);
			}
		};
		instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
		instantiationService.set(IViewsService, new class extends mock<IViewsService>() {
			override isViewVisible(id: string): boolean {
				return id === TERMINAL_VIEW_ID;
			}
		});

		const maximizeHandler = CommandsRegistry.getCommand('workbench.action.agentSessions.maximizeMainEditorPart')?.handler;
		const restoreHandler = CommandsRegistry.getCommand('workbench.action.agentSessions.restoreMainEditorPart')?.handler;
		assert.ok(maximizeHandler, 'Maximize command handler should be registered');
		assert.ok(restoreHandler, 'Restore command handler should be registered');

		await maximizeHandler(instantiationService);
		await restoreHandler(instantiationService);

		assert.deepStrictEqual(layoutService.hiddenParts, [Parts.PANEL_PART]);
		assert.deepStrictEqual(layoutService.shownParts, [Parts.PANEL_PART]);
		assert.deepStrictEqual(layoutService.maximizedStates, [true, false]);
		assert.strictEqual(layoutService.panelVisible, true);
	});

	test('restore editor does not reopen the panel when maximize left it visible', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			readonly shownParts: Parts[] = [];
			readonly maximizedStates: boolean[] = [];
			panelVisible = true;

			override isVisible(part: Parts): boolean {
				return part === Parts.PANEL_PART ? this.panelVisible : false;
			}

			override setPartHidden(hidden: boolean, part: Parts): void {
				if (part === Parts.PANEL_PART) {
					this.panelVisible = !hidden;
					if (!hidden) {
						this.shownParts.push(part);
					}
				}
			}

			override setEditorMaximized(maximized: boolean): void {
				this.maximizedStates.push(maximized);
			}
		};
		instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
		instantiationService.set(IViewsService, new class extends mock<IViewsService>() {
			override isViewVisible(_id: string): boolean {
				return false;
			}
		});

		const maximizeHandler = CommandsRegistry.getCommand('workbench.action.agentSessions.maximizeMainEditorPart')?.handler;
		const restoreHandler = CommandsRegistry.getCommand('workbench.action.agentSessions.restoreMainEditorPart')?.handler;
		assert.ok(maximizeHandler, 'Maximize command handler should be registered');
		assert.ok(restoreHandler, 'Restore command handler should be registered');

		await maximizeHandler(instantiationService);
		await restoreHandler(instantiationService);

		assert.deepStrictEqual(layoutService.shownParts, []);
		assert.deepStrictEqual(layoutService.maximizedStates, [true, false]);
		assert.strictEqual(layoutService.panelVisible, true);
	});
});
