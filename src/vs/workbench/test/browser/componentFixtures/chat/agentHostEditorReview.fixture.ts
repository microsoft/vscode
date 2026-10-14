/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../../base/common/assert.js';
import { Event } from '../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { EditSources } from '../../../../../editor/common/textModelEditSource.js';
import { TestCommandService } from '../../../../../editor/test/browser/editorTestServices.js';
import { IMenuService, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IVisibleEditorPane } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ITextFileContent, ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { AgentHostEditorReviewSession } from '../../../../contrib/chat/browser/agentSessions/agentHost/agentHostEditorReview.js';
import { IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { AcceptHunkAction, RejectHunkAction } from '../../../../contrib/chat/browser/chatEditing/chatEditingEditorActions.js';
import { ctxHasEditorModification } from '../../../../contrib/chat/browser/chatEditing/chatEditingEditorContextKeys.js';
import { IChatEditingExplanationModelManager } from '../../../../contrib/chat/browser/chatEditing/chatEditingExplanationModelManager.js';
import { emptySessionEntryDiff, IChatEditingService, IChatEditReviewSession } from '../../../../contrib/chat/common/editing/chatEditingService.js';
import { IChatModel } from '../../../../contrib/chat/common/model/chatModel.js';
import { TestWorkerService } from '../../../../contrib/inlineChat/test/browser/testWorkerService.js';
import { INotebookService } from '../../../../contrib/notebook/common/notebookService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureCondition } from '../fixtureUtils.js';

for (const action of [AcceptHunkAction, RejectHunkAction]) {
	if (!CommandsRegistry.getCommand(action.ID)) {
		registerAction2(action);
	}
}

class FixtureCommandService extends TestCommandService {
	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super(instantiationService);
	}
}

const before = `export const requestTimeout = 1000;

export interface RequestOptions {
	url: string;
	retries: number;
}

export function describeRequest(options: RequestOptions): string {
	return options.url;
}

export function normalizeRequest(options: RequestOptions): RequestOptions {
	return {
		...options,
		retries: Math.max(0, options.retries),
	};
}

export function getRetryDelay(attempt: number): number {
	return attempt * 100;
}
`;
const after = before.replace('1000', '5000').replace('attempt * 100', 'Math.min(attempt * 250, 5000)');

async function render(context: ComponentFixtureContext, state: 'pending' | 'keep' | 'undo' | 'live'): Promise<void> {
	const { container, disposableStore } = context;
	container.style.width = '850px';
	container.style.height = '540px';
	const resource = URI.file('/workspace/src/request.ts');
	const original = URI.parse('review-snapshot:/before/request.ts');
	const snapshot = URI.parse('review-snapshot:/after/request.ts');
	const contents = new ResourceMap<string>([[resource, after], [original, before], [snapshot, after]]);
	const sessions = observableValue<readonly IChatEditReviewSession[]>('sessions', []);
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			reg.define(IContextKeyService, ContextKeyService);
			reg.define(IMenuService, MenuService);
			reg.define(ICommandService, FixtureCommandService);
			reg.define(IActionViewItemService, NullActionViewItemService);
			reg.define(IEditorWorkerService, TestWorkerService);
			reg.defineInstance(IChatEditingService, upcastPartial<IChatEditingService>({
				editingSessionsObs: sessions,
				registerEditReviewSession: session => {
					sessions.set([...sessions.get(), session], undefined);
					return { dispose: () => sessions.set(sessions.get().filter(value => value !== session), undefined) };
				},
			}));
			reg.defineInstance(INotebookService, upcastPartial<INotebookService>({ hasSupportedNotebooks: () => false }));
			reg.defineInstance(IFileService, upcastPartial<IFileService>({ del: async uri => { contents.delete(uri); } }));
			reg.defineInstance(ITextModelService, upcastPartial<ITextModelService>({
				createModelReference: async uri => {
					const textEditorModel = modelService.getModel(uri);
					assert(textEditorModel !== null);
					return {
						object: upcastPartial<IResolvedTextEditorModel>({ textEditorModel, isReadonly: () => false }),
						dispose: () => { },
					};
				},
			}));
			reg.defineInstance(ITextFileService, upcastPartial<ITextFileService>({
				read: async uri => {
					const value = contents.get(uri);
					assert(value !== undefined);
					return upcastPartial<ITextFileContent>({ value: value! });
				},
				isDirty: () => false,
				save: async uri => { contents.set(uri, model.getValue()); return uri; },
			}));
			reg.defineInstance(IChatEditingExplanationModelManager, upcastPartial<IChatEditingExplanationModelManager>({ state: constObservable(new ResourceMap()) }));
			reg.defineInstance(IChatWidgetService, upcastPartial<IChatWidgetService>({}));
			reg.defineInstance(IViewsService, upcastPartial<IViewsService>({}));
			reg.defineInstance(IEditorService, upcastPartial<IEditorService>({ get activeEditorPane() { return pane; } }));
		},
	});
	const modelService = instantiationService.get(IModelService);
	const model = disposableStore.add(modelService.createModel(after, null, resource, false));
	const chatModel = new class extends mock<IChatModel>() {
		override readonly sessionResource = URI.parse('vendor-session:/review-demo');
		override readonly lastRequestObs = constObservable(undefined);
		override readonly hasActiveRequest = constObservable(false);
		override readonly requestInProgress = constObservable(false);
		override readonly onDidDispose = Event.None;
		override get lastRequest() { return undefined; }
	}();
	const session = disposableStore.add(instantiationService.createInstance(AgentHostEditorReviewSession, chatModel));
	const diff = { ...emptySessionEntryDiff(original, resource), modifiedSnapshotURI: snapshot };
	session.setChanges([diff]);
	await session.whenReady();
	const entry = session.getEntry(resource);
	assert(entry !== undefined);
	await entry.getDiffInfo();
	ctxHasEditorModification.bindTo(instantiationService.get(IContextKeyService)).set(true);
	const editor = disposableStore.add(instantiationService.createInstance(CodeEditorWidget, container, {
		dimension: { width: 850, height: 540 },
		minimap: { enabled: false },
		scrollBeyondLastLine: false,
	}, { contributions: [] }));
	editor.setModel(model);
	const pane = upcastPartial<IVisibleEditorPane>({ input: upcastPartial<EditorInput>({ resource }), getControl: () => editor });
	entry.getEditorIntegration(pane);
	editor.setPosition({ lineNumber: 1, column: 1 });
	if (state === 'keep' || state === 'undo') {
		await instantiationService.get(ICommandService).executeCommand(state === 'keep' ? AcceptHunkAction.ID : RejectHunkAction.ID);
	}
	if (state === 'live') {
		const current = after.replace('requestTimeout = 5000', 'requestTimeout = 10000');
		const nextSnapshot = URI.parse('review-snapshot:/next/request.ts');
		contents.set(resource, current);
		contents.set(nextSnapshot, current);
		modelService.updateModel(model, current, EditSources.reloadFromDisk());
		session.setChanges([{ ...diff, modifiedSnapshotURI: nextSnapshot }]);
		await session.whenReady();
		await entry.getDiffInfo();
		assert(editor.getModel() === model);
	}
	editor.render();
	const expectedHunks = state === 'keep' || state === 'undo' ? 1 : 2;
	await waitForFixtureCondition(() => container.querySelectorAll('.chat-diff-change-content-widget').length === expectedHunks, `Expected ${expectedHunks} editor widgets for ${entry.changesCount.get()} hunks.`);
}

export default defineThemedFixtureGroup({ path: 'chat/editorReview/' }, {
	Pending: defineComponentFixture({ render: context => render(context, 'pending'), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	AfterKeep: defineComponentFixture({ render: context => render(context, 'keep') }),
	AfterUndo: defineComponentFixture({ render: context => render(context, 'undo') }),
	LiveUpdate: defineComponentFixture({ render: context => render(context, 'live') }),
});
