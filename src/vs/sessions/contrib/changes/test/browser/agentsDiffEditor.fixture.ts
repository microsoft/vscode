/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/multiFileDiffEditor.css';
import '../../../agentFeedback/browser/media/agentFeedbackEditorInput.css';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
import { $, Dimension, getWindow } from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { MultiDiffEditorWidget } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { IDocumentDiffItem } from '../../../../../editor/browser/widget/multiDiffEditor/model.js';
import { IResourceLabel, IWorkbenchUIElementFactory } from '../../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { IMenu, IMenuActionOptions, IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ResourceLabel } from '../../../../../workbench/browser/labels.js';
import { IVisibleEditorPane } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IDecorationsService } from '../../../../../workbench/services/decorations/common/decorations.js';
import { IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { INotebookDocumentService } from '../../../../../workbench/services/notebook/common/notebookDocumentService.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { TestEditorInput } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { AgentFeedbackEditorInputContribution } from '../../../agentFeedback/browser/agentFeedbackEditorInputContribution.js';
import { AgentFeedbackOverlayController, IAgentFeedbackOverlayEditorGroup } from '../../../agentFeedback/browser/agentFeedbackEditorOverlay.js';
import { clearAllFeedbackActionId, navigateNextFeedbackActionId, navigatePreviousFeedbackActionId, navigationBearingFakeActionId, submitFeedbackActionId } from '../../../agentFeedback/browser/agentFeedbackEditorActions.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { Menus } from '../../../../browser/menus.js';
import { ISession } from '../../../../services/sessions/common/session.js';

const SESSION_RESOURCE = URI.parse('fixture-session://agents-diff');
const MODIFIED_FIRST_RESOURCE = URI.file('/workspace/src/first.ts');
const OVERLAY_RESOURCE = URI.file('/workspace/changes.diff');
const FIXTURE_WIDTH = 860;
const FIXTURE_HEIGHT = 620;
const DETAIL_WIDTH = 280;

const UNCHANGED_LINES = Array.from({ length: 18 }, (_, index) => `const unchanged${index} = ${index};`).join('\n');

class FixtureAgentFeedbackMenuService implements IMenuService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	createMenu(id: MenuId): IMenu {
		if (id !== Menus.AgentFeedbackEditorContent) {
			return {
				onDidChange: Event.None,
				dispose: () => { },
				getActions: () => [],
			};
		}
		const createAction = (actionId: string, title: string, icon: ThemeIcon) => this.instantiationService.createInstance(
			MenuItemAction,
			{ id: actionId, title, icon },
			undefined,
			{ renderShortTitle: true },
			undefined,
			undefined,
		);
		const navigateActions = [
			createAction(navigationBearingFakeActionId, 'Navigation Status', Codicon.commentDiscussion),
			createAction(navigatePreviousFeedbackActionId, 'Previous', Codicon.arrowUp),
			createAction(navigateNextFeedbackActionId, 'Next', Codicon.arrowDown),
		];
		const submitActions = [
			createAction(submitFeedbackActionId, 'Submit', Codicon.send),
			createAction(clearAllFeedbackActionId, 'Clear', Codicon.clearAll),
		];
		return {
			onDidChange: Event.None,
			dispose: () => { },
			getActions: () => [
				['navigate', navigateActions],
				['a_submit', submitActions],
			],
		};
	}

	getMenuActions(_id: MenuId, _contextKeyService: IContextKeyService, _options?: IMenuActionOptions) { return []; }
	getMenuContexts() { return new Set<string>(); }
	resetHiddenStates() { }
}

class AgentsDiffUIElementFactory implements IWorkbenchUIElementFactory {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	createResourceLabel(element: HTMLElement): IResourceLabel {
		const label = this.instantiationService.createInstance(ResourceLabel, element, {});
		return {
			setUri(uri, options = {}) {
				if (!uri) {
					label.element.clear();
				} else {
					label.element.setFile(uri, { strikethrough: options.strikethrough });
				}
			},
			dispose: () => label.dispose(),
		};
	}
}

function createFixtureSession(): ISession {
	return new class extends mock<ISession>() {
		override readonly resource = SESSION_RESOURCE;
		override readonly changes = constObservable([]);
	}();
}

function createAgentFeedbackService(feedback: readonly IAgentFeedback[] = [], feedbackScopeResource: URI = MODIFIED_FIRST_RESOURCE): IAgentFeedbackService {
	const session = createFixtureSession();
	return new class extends mock<IAgentFeedbackService>() {
		override readonly onDidChangeFeedback = Event.None;
		override readonly onDidChangeFeedbackVisibility = Event.None;
		override readonly onDidChangeNavigation = Event.None;
		override readonly onDidChangeFeedbackScope = Event.None;
		override readonly onDidRevealSessionComment = Event.None;
		override getVisibleResolvedFeedbackIds(): ReadonlySet<string> {
			return new Set();
		}
		override getSessionForFile(resource: URI): ISession | undefined {
			return resource.toString() === MODIFIED_FIRST_RESOURCE.toString() ? session : undefined;
		}
		override getFeedbackSessionResource(resource: URI): URI | undefined {
			return resource.toString() === feedbackScopeResource.toString() ? SESSION_RESOURCE : undefined;
		}
		override getFeedback() {
			return feedback;
		}
		override getNavigationBearing() {
			return { activeIdx: feedback.length > 0 ? 0 : -1, totalCount: feedback.length };
		}
	}();
}

class FixtureOverlayEditorGroup extends mock<IEditorGroup>() implements IAgentFeedbackOverlayEditorGroup {

	override readonly id = 1;
	override readonly onDidActiveEditorChange = Event.None;
	override readonly onDidModelChange = Event.None;
	override readonly activeEditor: TestEditorInput;
	override readonly activeEditorPane: IVisibleEditorPane;

	constructor(
		readonly editorPaneContainer: HTMLElement,
		input: TestEditorInput,
	) {
		super();
		this.activeEditor = input;
		this.activeEditorPane = new class extends mock<IVisibleEditorPane>() {
			override readonly input = input;
		}();
	}

	override getIndexOfEditor(editor: EditorInput): number {
		return editor === this.activeEditor ? 0 : -1;
	}

	override async closeEditor(): Promise<boolean> {
		return true;
	}
}

function createContextKeyService(): IContextKeyService {
	return new class extends MockContextKeyService {
		override contextMatchesRules(): boolean { return true; }
	}();
}

interface IAgentsDiffFixtureOptions {
	readonly showSubmitOverlay?: boolean;
}

async function renderAgentsDiffEditor({ container, disposableStore, disposableStackStore, theme }: ComponentFixtureContext, options: IAgentsDiffFixtureOptions = {}): Promise<void> {
	const editorWidth = options.showSubmitOverlay ? FIXTURE_WIDTH - DETAIL_WIDTH : 520;
	const fixtureWidth = options.showSubmitOverlay ? FIXTURE_WIDTH : editorWidth;
	container.classList.add('agent-sessions-workbench', 'dock-detail-panel');
	container.style.width = `${fixtureWidth}px`;
	container.style.height = `${FIXTURE_HEIGHT}px`;
	container.style.background = 'var(--vscode-agentsPanel-background)';

	const editorPart = container.appendChild($('.part.editor'));
	editorPart.style.position = 'relative';
	editorPart.style.width = '100%';
	editorPart.style.height = '100%';

	const editorContent = editorPart.appendChild($('.content'));
	editorContent.style.width = '100%';
	editorContent.style.height = '100%';

	const editorGroup = editorContent.appendChild($('.editor-group-container'));
	editorGroup.style.position = 'relative';
	editorGroup.style.width = '100%';
	editorGroup.style.height = '100%';

	const editorPane = editorGroup.appendChild($('.editor-container'));
	editorPane.style.width = `${editorWidth}px`;
	editorPane.style.height = '100%';

	const editorInstance = editorPane.appendChild($('.editor-instance'));
	editorInstance.style.width = '100%';
	editorInstance.style.height = '100%';

	const feedback: readonly IAgentFeedback[] = options.showSubmitOverlay ? [{
		id: 'feedback-1',
		text: 'Keep the submit control with the diff.',
		resourceUri: MODIFIED_FIRST_RESOURCE,
		range: { startLineNumber: 19, startColumn: 1, endLineNumber: 19, endColumn: 1 },
		sessionResource: SESSION_RESOURCE,
		kind: AgentFeedbackKind.UserReview,
		state: AgentFeedbackState.Accepted,
	}] : [];
	const agentFeedbackService = createAgentFeedbackService(feedback, options.showSubmitOverlay ? OVERLAY_RESOURCE : MODIFIED_FIRST_RESOURCE);
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IAgentFeedbackService, agentFeedbackService);
			reg.defineInstance(IContextKeyService, createContextKeyService());
			reg.define(IMenuService, FixtureAgentFeedbackMenuService);
			reg.defineInstance(IDecorationsService, new class extends mock<IDecorationsService>() { override onDidChangeDecorations = Event.None; }());
			reg.defineInstance(ITextFileService, new class extends mock<ITextFileService>() { override readonly untitled = new class extends mock<ITextFileService['untitled']>() { override readonly onDidChangeLabel = Event.None; }(); }());
			reg.defineInstance(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { override onDidChangeWorkspaceFolders = Event.None; override getWorkspace(): IWorkspace { return { id: '', folders: [], configuration: undefined }; } }());
			reg.defineInstance(INotebookDocumentService, new class extends mock<INotebookDocumentService>() { override getNotebook(): undefined { return undefined; } }());
			reg.definePartialInstance(IEditorProgressService, {
				show: () => ({ total: () => { }, worked: () => { }, done: () => { } }),
			});
			reg.defineInstance(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		},
	});

	const textModels = disposableStackStore.add(new DisposableStore());
	const firstOriginal = textModels.add(createTextModel(instantiationService, `${UNCHANGED_LINES}\nconst status = 'before';\n${UNCHANGED_LINES}`, URI.file('/workspace/src/first.original.ts'), 'typescript'));
	const firstModified = textModels.add(createTextModel(instantiationService, `${UNCHANGED_LINES}\nconst status = 'after';\nconst enabled = true;\n${UNCHANGED_LINES}`, MODIFIED_FIRST_RESOURCE, 'typescript'));
	const secondOriginal = textModels.add(createTextModel(instantiationService, 'export function count() {\n\treturn 1;\n}', URI.file('/workspace/src/second.original.ts'), 'typescript'));
	const secondModified = textModels.add(createTextModel(instantiationService, 'export function count() {\n\treturn 2;\n}', URI.file('/workspace/src/second.ts'), 'typescript'));

	const first = RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original: firstOriginal, modified: firstModified }, { dispose() { } });
	const second = RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original: secondOriginal, modified: secondModified }, { dispose() { } });
	const widget = disposableStackStore.add(instantiationService.createInstance(
		MultiDiffEditorWidget,
		editorInstance,
		instantiationService.createInstance(AgentsDiffUIElementFactory),
		{
			hideOriginalLineNumbers: true,
			folding: false,
			hideUnchangedRegions: { enabled: true },
			lineNumbersMinChars: 3,
		},
	));
	widget.setRenderSideBySide(false);

	const viewModel = disposableStackStore.add(widget.createViewModel({
		documents: ValueWithChangeEvent.const([first, second]),
	}));
	widget.setViewModel(viewModel);
	widget.layout(new Dimension(editorWidth, FIXTURE_HEIGHT));
	disposableStackStore.add(toDisposable(() => widget.setViewModel(undefined)));

	if (options.showSubmitOverlay) {
		renderDockedDetailPanel(editorPart);
		const input = disposableStackStore.add(new TestEditorInput(OVERLAY_RESOURCE, 'fixture.agentsDiff'));
		const group = new FixtureOverlayEditorGroup(editorPane, input);
		disposableStackStore.add(instantiationService.createInstance(AgentFeedbackOverlayController, group));
		return;
	}

	const targetWindow = getWindow(container);
	await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => targetWindow.requestAnimationFrame(() => resolve())));

	const editor = widget.tryGetCodeEditor(MODIFIED_FIRST_RESOURCE)?.editor;
	if (editor) {
		disposableStackStore.add(widget.getScopedInstantiationService().createInstance(AgentFeedbackEditorInputContribution, editor));
	}
	const lineNumber = editor?.getDomNode()?.querySelector<HTMLElement>('.line-numbers');
	lineNumber?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: lineNumber.getBoundingClientRect().left + 1, clientY: lineNumber.getBoundingClientRect().top + 1 }));
	await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
}

function renderDockedDetailPanel(editorPart: HTMLElement): void {
	const detail = editorPart.appendChild($('.part.auxiliarybar.docked-auxiliarybar'));
	detail.style.position = 'absolute';
	detail.style.top = '0';
	detail.style.right = '0';
	detail.style.width = `${DETAIL_WIDTH}px`;
	detail.style.height = '100%';
	detail.style.boxSizing = 'border-box';
	detail.style.background = 'var(--vscode-sideBar-background)';
	detail.style.borderLeft = 'var(--vscode-strokeThickness) solid var(--vscode-sideBar-border)';

	const title = detail.appendChild($('.fixture-docked-detail-title'));
	title.textContent = 'Files';
	title.style.height = '35px';
	title.style.boxSizing = 'border-box';
	title.style.padding = '8px 12px';
	title.style.fontWeight = 'var(--vscode-fontWeight-semiBold)';
	title.style.borderBottom = 'var(--vscode-strokeThickness) solid var(--vscode-sideBar-border)';

	const files = detail.appendChild($('.fixture-docked-detail-files'));
	files.style.padding = '8px 12px';
	for (const [name, stats] of [['first.ts', '+2 -1'], ['second.ts', '+1 -1'], ['README.md', '+4 -0']]) {
		const row = files.appendChild($('.fixture-docked-detail-file'));
		row.style.display = 'flex';
		row.style.justifyContent = 'space-between';
		row.style.padding = '6px 0';
		row.appendChild(document.createTextNode(name));
		const count = row.appendChild($('span'));
		count.textContent = stats;
		count.style.color = 'var(--vscode-descriptionForeground)';
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/changes/' }, {
	CompactDiffWithFeedback: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderAgentsDiffEditor,
	}),
	CompactDiffWithSubmitOverlay: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAgentsDiffEditor(context, { showSubmitOverlay: true }),
	}),
});
