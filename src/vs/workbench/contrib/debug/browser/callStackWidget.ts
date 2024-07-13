/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { assertNever } from 'vs/base/common/assert';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { autorun, derived, IObservable, ISettableObservable, observableValue } from 'vs/base/common/observable';
import { Constants } from 'vs/base/common/uint';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/callStackWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/embeddedCodeEditorWidget';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { Location } from 'vs/editor/common/languages';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize, localize2 } from 'vs/nls';
import { createActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TextEditorSelectionRevealType } from 'vs/platform/editor/common/editor';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import { makeStackFrameColumnDecoration, TOP_STACK_FRAME_DECORATION } from 'vs/workbench/contrib/debug/browser/callStackEditorContribution';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';


export class CallStackFrame {
	constructor(
		public readonly name: string,
		public readonly source?: URI,
		public readonly line = 1,
		public readonly column = 1,
	) { }
}

export class SkippedCallFrames {
	constructor(
		public readonly label: string,
		public readonly load: (token: CancellationToken) => Promise<AnyStackFrame[]>,
	) { }
}

export type AnyStackFrame = SkippedCallFrames | CallStackFrame;

class WrappedCallStackFrame extends CallStackFrame {
	public readonly editorHeight: ISettableObservable<number>;
	public readonly collapsed = observableValue('WrappedCallStackFrame.collapsed', false);
	public readonly height: IObservable<number>;

	constructor(original: CallStackFrame, defaultLineHeight: number) {
		super(original.name, original.source, original.line, original.column);
		// the actual height will be updated when the editor is rendered, but
		// estimate it initially to make sure the scroll is approximately correct
		this.editorHeight = observableValue('WrappedCallStackFrame.editorHeight', defaultLineHeight * (LINES_AROUND * 2 + 1));
		this.height = derived(reader => {
			return this.collapsed.read(reader) ? HEADER_HEIGHT : HEADER_HEIGHT + this.editorHeight.read(reader);
		});
	}
}

type ListItem = WrappedCallStackFrame | SkippedCallFrames;

const WIDGET_CLASS_NAME = 'multiCallStackWidget';

/**
 * A reusable widget that displays a call stack as a series of editors. Note
 * that this both used in debug's exception widget as well as in the testing
 * call stack view.
 */
export class CallStackWidget extends Disposable {
	private readonly list: WorkbenchList<ListItem>;
	private readonly layoutEmitter = this._register(new Emitter<void>());
	private readonly currentFramesDs = this._register(new DisposableStore());
	private cts?: CancellationTokenSource;

	constructor(
		container: HTMLElement,
		containingEditor: ICodeEditor | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		container.classList.add(WIDGET_CLASS_NAME);
		this._register(toDisposable(() => container.classList.remove(WIDGET_CLASS_NAME)));

		this.list = this._register(instantiationService.createInstance(
			WorkbenchList,
			'TestResultStackWidget',
			container,
			new StackDelegate(),
			[
				instantiationService.createInstance(FrameCodeRenderer, containingEditor, this.layoutEmitter.event),
				instantiationService.createInstance(MissingCodeRenderer),
				instantiationService.createInstance(SkippedRenderer, (i) => this.loadFrame(i)),
			],
			{
				horizontalScrolling: false,
				multipleSelectionSupport: false,
				accessibilityProvider: instantiationService.createInstance(StackAccessibilityProvider),
			}
		) as WorkbenchList<ListItem>);
	}

	/** Replaces the call frames display in the view. */
	public setFrames(frames: AnyStackFrame[]): void {
		// cancel any existing load
		this.currentFramesDs.clear();
		this.cts = new CancellationTokenSource();
		this._register(toDisposable(() => this.cts!.dispose(true)));

		this.list.splice(0, this.list.length, this.mapFrames(frames));
	}

	public layout(height?: number, width?: number): void {
		this.list.layout(height, width);
		this.layoutEmitter.fire();
	}

	private async loadFrame(replacing: SkippedCallFrames): Promise<void> {
		if (!this.cts) {
			return;
		}

		const frames = await replacing.load(this.cts.token);
		if (this.cts.token.isCancellationRequested) {
			return;
		}

		const index = this.list.indexOf(replacing);
		this.list.splice(index, 1, this.mapFrames(frames));
	}

	private mapFrames(frames: AnyStackFrame[]): ListItem[] {
		const result: ListItem[] = [];
		const defaultLineHeight = this.configurationService.getValue<number>('editor.lineHeight');
		for (const frame of frames) {
			if (!(frame instanceof CallStackFrame)) {
				result.push(frame);
				continue;
			}

			const wrapped = new WrappedCallStackFrame(frame, defaultLineHeight);
			result.push(wrapped);

			this.currentFramesDs.add(autorun(reader => {
				const height = wrapped.height.read(reader);
				const idx = this.list.indexOf(wrapped);
				if (idx !== -1) {
					this.list.updateElementHeight(idx, height);
				}
			}));
		}

		return result;
	}
}

class StackAccessibilityProvider implements IListAccessibilityProvider<ListItem> {
	constructor(@ILabelService private readonly labelService: ILabelService) { }

	getAriaLabel(e: ListItem): string | IObservable<string> | null {
		if (e instanceof SkippedCallFrames) {
			return e.label;
		}

		if (e instanceof CallStackFrame) {
			if (e.source && e.line) {
				return localize({
					comment: ['{0} is an extension-defined label, then line number and filename'],
					key: 'stackTraceLabel',
				}, '{0}, line {1} in {2}', e.name, e.line, this.labelService.getUriLabel(e.source, { relative: true }));
			}

			return e.name;
		}

		assertNever(e);
	}
	getWidgetAriaLabel(): string {
		return localize('stackTrace', 'Stack Trace');
	}
}

class StackDelegate implements IListVirtualDelegate<ListItem> {
	getHeight(element: ListItem): number {
		if (element instanceof CallStackFrame) {
			return element.height.get();
		}
		if (element instanceof SkippedCallFrames) {
			return 50;
		}

		assertNever(element);
	}

	getTemplateId(element: ListItem): string {
		if (element instanceof CallStackFrame) {
			return element.source ? FrameCodeRenderer.templateId : MissingCodeRenderer.templateId;
		}
		if (element instanceof SkippedCallFrames) {
			return SkippedRenderer.templateId;
		}

		assertNever(element);
	}
}

interface IStackTemplateData {
	container: HTMLElement;
	editor: CodeEditorWidget;
	label: ResourceLabel;
	elements: ReturnType<typeof makeFrameElements>;
	decorations: string[];
	collapse: Button;
	toolbar: MenuWorkbenchToolBar;
	elementStore: DisposableStore;
	templateStore: DisposableStore;
}

const editorOptions: IEditorOptions = {
	scrollBeyondLastLine: false,
	scrollbar: {
		vertical: 'hidden',
		horizontal: 'auto',
		handleMouseWheel: false,
		useShadows: false,
	},
	glyphMargin: false,
	overviewRulerLanes: 0,
	fixedOverflowWidgets: true,
	overviewRulerBorder: false,
	stickyScroll: { enabled: false },
	minimap: { enabled: false },
	readOnly: true,
	wordWrap: 'off',
};

const makeFrameElements = () => dom.h('div.multiCallStackFrame', [
	dom.h('div.header@header', [
		dom.h('div.collapse-button@collapseButton'),
		dom.h('div.title.show-file-icons@title'),
		dom.h('div.actions@actions'),
	]),

	dom.h('div.editorParent', [
		dom.h('div.editorContainer@editor'),
	])
]);

const HEADER_HEIGHT = 40;
const LINES_AROUND = 3;

/** Renderer for a normal stack frame where code is available. */
class FrameCodeRenderer implements IListRenderer<ListItem, IStackTemplateData> {
	public static readonly templateId = 'f';

	public readonly templateId = FrameCodeRenderer.templateId;

	constructor(
		private readonly containingEditor: ICodeEditor | undefined,
		private readonly onLayout: Event<void>,
		@ITextModelService private readonly modelService: ITextModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	renderTemplate(container: HTMLElement): IStackTemplateData {
		const containingEditor = this.containingEditor;
		const elements = makeFrameElements();
		container.appendChild(elements.root);

		const templateStore = new DisposableStore();
		templateStore.add(toDisposable(() => dom.clearNode(elements.root)));

		const editor = containingEditor
			? this.instantiationService.createInstance(
				EmbeddedCodeEditorWidget,
				elements.editor,
				editorOptions,
				{},
				containingEditor,
			)
			: this.instantiationService.createInstance(
				CodeEditorWidget,
				elements.editor,
				editorOptions,
				{},
			);

		templateStore.add(editor);

		const label = templateStore.add(this.instantiationService.createInstance(ResourceLabel, elements.title, {}));

		const toolbar = templateStore.add(this.instantiationService.createInstance(MenuWorkbenchToolBar, elements.actions, MenuId.DebugCallStackToolbar, {
			menuOptions: { shouldForwardArgs: true },
			actionViewItemProvider: (action, options) => createActionViewItem(this.instantiationService, action, options),
		}));

		const collapse = templateStore.add(new Button(elements.collapseButton, {}));

		return {
			editor,
			container,
			decorations: [],
			elements,
			label,
			toolbar,
			collapse,
			elementStore: templateStore.add(new DisposableStore()),
			templateStore,
		};
	}

	renderElement(element: ListItem, index: number, template: IStackTemplateData, height: number | undefined): void {
		const { elementStore, editor } = template;
		elementStore.clear();

		const item = element as WrappedCallStackFrame;
		const uri = item.source!;

		this.setupCollapseButton(item, template);
		this.setupEditorLayout(item, template);
		template.label.element.setFile(uri);

		const cts = new CancellationTokenSource();
		elementStore.add(toDisposable(() => cts.dispose(true)));
		this.modelService.createModelReference(uri).then(reference => {
			if (cts.token.isCancellationRequested) {
				return reference.dispose();
			}

			elementStore.add(reference);
			editor.setModel(reference.object.textEditorModel);
			this.setupEditorAfterModel(item, template);
		});
	}

	private setupEditorLayout(item: WrappedCallStackFrame, { elementStore, container, editor }: IStackTemplateData) {
		const layout = (height = item.editorHeight.get()) =>
			editor.layout({ width: container.clientWidth, height });
		elementStore.add(this.onLayout(() => layout()));
		elementStore.add(autorun(reader => layout(item.editorHeight.read(reader))));
	}

	private setupCollapseButton(item: WrappedCallStackFrame, { elementStore, elements, collapse, editor }: IStackTemplateData) {
		elementStore.add(autorun(reader => {
			collapse.element.className = '';
			collapse.icon = item.collapsed.read(reader) ? Codicon.chevronRight : Codicon.chevronDown;
			elements.root.classList.toggle('collapsed', item.collapsed.get());
		}));
		elementStore.add(collapse.onDidClick(() => {
			item.collapsed.set(!item.collapsed.get(), undefined);
		}));
	}

	private setupEditorAfterModel(item: WrappedCallStackFrame, template: IStackTemplateData): void {
		const range = Range.fromPositions({
			column: item.column ?? 1,
			lineNumber: item.line ?? 1,
		});

		template.toolbar.context = { uri: item.source, range };

		template.editor.setHiddenAreas([
			Range.fromPositions({ lineNumber: 1, column: 1 }, { lineNumber: range.startLineNumber - LINES_AROUND, column: 1 }),
			Range.fromPositions({ lineNumber: range.startLineNumber + LINES_AROUND, column: 1 }, { lineNumber: Constants.MAX_SAFE_SMALL_INTEGER, column: 1 }),
		]);

		template.editor.revealRangeInCenter(range);

		const updateEditorHeight = () => {
			item.editorHeight.set(template.editor.getScrollHeight(), undefined);
		};

		template.elementStore.add(template.editor.onDidContentSizeChange(updateEditorHeight));
		updateEditorHeight();

		template.editor.changeDecorations(accessor => {
			for (const d of template.decorations) {
				accessor.removeDecoration(d);
			}
			template.decorations.length = 0;

			const beforeRange = range.setStartPosition(range.startLineNumber, 1);
			const hasCharactersBefore = !!template.editor.getModel()?.getValueInRange(beforeRange).trim();
			const decoRange = range.setEndPosition(range.startLineNumber, Constants.MAX_SAFE_SMALL_INTEGER);

			template.decorations.push(accessor.addDecoration(
				decoRange,
				makeStackFrameColumnDecoration(!hasCharactersBefore),
			));
			template.decorations.push(accessor.addDecoration(
				decoRange,
				TOP_STACK_FRAME_DECORATION,
			));
		});
	}

	disposeElement(element: ListItem, index: number, templateData: IStackTemplateData, height: number | undefined): void {
		templateData.elementStore.clear();
	}

	disposeTemplate(templateData: IStackTemplateData): void {
		templateData.templateStore.dispose();
	}
}

interface IMissingTemplateData {
	container: HTMLElement;
}

/** Renderer for a call frame that's missing a URI */
class MissingCodeRenderer implements IListRenderer<ListItem, IMissingTemplateData> {
	public static readonly templateId = 'm';
	public readonly templateId = MissingCodeRenderer.templateId;

	renderTemplate(container: HTMLElement): IMissingTemplateData {
		return { container };
	}

	renderElement(element: ListItem, index: number, templateData: IMissingTemplateData, height: number | undefined): void {
		templateData.container.innerText = (element as CallStackFrame).name;
	}

	disposeTemplate(templateData: IMissingTemplateData): void {
		dom.clearNode(templateData.container);
	}
}

interface ISkippedTemplateData {
	button: Button;
	current?: SkippedCallFrames;
	store: DisposableStore;
}

/** Renderer for a button to load more call frames */
class SkippedRenderer implements IListRenderer<ListItem, ISkippedTemplateData> {
	public static readonly templateId = 's';
	public readonly templateId = SkippedRenderer.templateId;

	constructor(
		private readonly loadFrames: (fromItem: SkippedCallFrames) => Promise<void>,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	renderTemplate(container: HTMLElement): ISkippedTemplateData {
		const store = new DisposableStore();
		const button = new Button(container, { title: '', ...defaultButtonStyles });
		const data: ISkippedTemplateData = { button, store };

		store.add(button);
		store.add(button.onDidClick(() => {
			if (!data.current || !button.enabled) {
				return;
			}

			button.enabled = false;
			this.loadFrames(data.current).catch(e => {
				this.notificationService.error(localize('failedToLoadFrames', 'Failed to load stack frames: {0}', e.message));
			});
		}));

		return data;
	}

	renderElement(element: ListItem, index: number, templateData: ISkippedTemplateData, height: number | undefined): void {
		const cast = element as SkippedCallFrames;
		templateData.button.enabled = true;
		templateData.button.label = cast.label;
		templateData.current = cast;
	}

	disposeTemplate(templateData: ISkippedTemplateData): void {
		templateData.store.dispose();
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'callStackWidget.goToFile',
			title: localize2('goToFile', 'Open File'),
			icon: Codicon.goToFile,
			menu: {
				id: MenuId.DebugCallStackToolbar,
				order: 22,
				group: 'navigation',
			},
		});
	}

	async run(accessor: ServicesAccessor, { uri, range }: Location): Promise<void> {
		const editorService = accessor.get(IEditorService);
		await editorService.openEditor({
			resource: uri,
			options: {
				selection: range,
				selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport,
			},
		});
	}
});
