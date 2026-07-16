/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/multiFileDiffEditor.css';
import '../../../agentFeedback/browser/media/agentFeedbackEditorInput.css';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
import { $, Dimension, getWindow } from '../../../../../base/browser/dom.js';
import { Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { MultiDiffEditorWidget } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { IDocumentDiffItem } from '../../../../../editor/browser/widget/multiDiffEditor/model.js';
import { IResourceLabel, IWorkbenchUIElementFactory } from '../../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ResourceLabel } from '../../../../../workbench/browser/labels.js';
import { IDecorationsService } from '../../../../../workbench/services/decorations/common/decorations.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { INotebookDocumentService } from '../../../../../workbench/services/notebook/common/notebookDocumentService.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { AgentFeedbackEditorInputContribution } from '../../../agentFeedback/browser/agentFeedbackEditorInputContribution.js';
import { IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { ISession } from '../../../../services/sessions/common/session.js';

const SESSION_RESOURCE = URI.parse('fixture-session://agents-diff');
const MODIFIED_FIRST_RESOURCE = URI.file('/workspace/src/first.ts');

const UNCHANGED_LINES = Array.from({ length: 18 }, (_, index) => `const unchanged${index} = ${index};`).join('\n');

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

function createAgentFeedbackService(): IAgentFeedbackService {
	const session = createFixtureSession();
	return new class extends mock<IAgentFeedbackService>() {
		override readonly onDidChangeFeedback = Event.None;
		override readonly onDidChangeNavigation = Event.None;
		override getSessionForFile(resource: URI): ISession | undefined {
			return resource.toString() === MODIFIED_FIRST_RESOURCE.toString() ? session : undefined;
		}
		override getFeedback() {
			return [];
		}
		override getNavigationBearing() {
			return { activeIdx: -1, totalCount: 0 };
		}
	}();
}

function createContextKeyService(): IContextKeyService {
	return new class extends MockContextKeyService {
		override contextMatchesRules(): boolean { return true; }
	}();
}

async function renderAgentsDiffEditor({ container, disposableStore, disposableStackStore, theme }: ComponentFixtureContext): Promise<void> {
	container.classList.add('agent-sessions-workbench');
	container.style.width = '520px';
	container.style.height = '620px';
	container.style.background = 'var(--vscode-agentsPanel-background)';

	const editorPart = container.appendChild($('.part.editor'));
	editorPart.style.height = '100%';

	const agentFeedbackService = createAgentFeedbackService();
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			reg.defineInstance(IAgentFeedbackService, agentFeedbackService);
			reg.defineInstance(IContextKeyService, createContextKeyService());
			reg.defineInstance(IDecorationsService, new class extends mock<IDecorationsService>() { override onDidChangeDecorations = Event.None; }());
			reg.defineInstance(ITextFileService, new class extends mock<ITextFileService>() { override readonly untitled = new class extends mock<ITextFileService['untitled']>() { override readonly onDidChangeLabel = Event.None; }(); }());
			reg.defineInstance(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { override onDidChangeWorkspaceFolders = Event.None; override getWorkspace(): IWorkspace { return { id: '', folders: [], configuration: undefined }; } }());
			reg.defineInstance(INotebookDocumentService, new class extends mock<INotebookDocumentService>() { override getNotebook(): undefined { return undefined; } }());
			reg.definePartialInstance(IEditorProgressService, {
				show: () => ({ total: () => { }, worked: () => { }, done: () => { } }),
			});
			reg.defineInstance(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
			registerWorkbenchServices(reg);
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
		editorPart,
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
	widget.layout(new Dimension(520, 620));
	disposableStackStore.add(toDisposable(() => widget.setViewModel(undefined)));

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

export default defineThemedFixtureGroup({ path: 'sessions/changes/' }, {
	CompactDiffWithFeedback: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderAgentsDiffEditor,
	}),
});
