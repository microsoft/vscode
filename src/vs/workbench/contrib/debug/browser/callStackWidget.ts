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
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { autorun, autorunWithStore, derived, IObservable, ISettableObservable, observableValue } from 'vs/base/common/observable';
import { ThemeIcon } from 'vs/base/common/themables';
import { Constants } from 'vs/base/common/uint';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import 'vs/css!./media/callStackWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
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

export abstract class CustomStackFrame {
	public readonly showHeader = observableValue('CustomStackFrame.showHeader', true);
	public abstract readonly height: IObservable<number>;
	public abstract readonly label: string;
	public icon?: ThemeIcon;
	public abstract render(container: HTMLElement): IDisposable;
	public renderActions?(container: HTMLElement): IDisposable;
}

export type AnyStackFrame = SkippedCallFrames | CallStackFrame | CustomStackFrame;

interface IFrameLikeItem {
	readonly collapsed: ISettableObservable<boolean>;
	readonly height: IObservable<number>;
}

class WrappedCallStackFrame extends CallStackFrame implements IFrameLikeItem {
	public readonly editorHeight = observableValue('WrappedCallStackFrame.height', this.source ? 100 : 0);
	public readonly collapsed = observableValue('WrappedCallStackFrame.collapsed', false);

	public readonly height = derived(reader => {
		return this.collapsed.read(reader) ? HEADER_HEIGHT : HEADER_HEIGHT + this.editorHeight.read(reader);
	});

	constructor(original: CallStackFrame) {
		super(original.name, original.source, original.line, original.column);
	}
}

class WrappedCustomStackFrame implements IFrameLikeItem {
	public readonly collapsed = observableValue('WrappedCallStackFrame.collapsed', false);

	public readonly height = derived(reader => {
		const headerHeight = this.original.showHeader.read(reader) ? HEADER_HEIGHT : 0;
		return this.collapsed.read(reader) ? headerHeight : headerHeight + this.original.height.read(reader);
	});

	constructor(public readonly original: CustomStackFrame) { }
}

type ListItem = WrappedCallStackFrame | SkippedCallFrames | WrappedCustomStackFrame;

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
				instantiationService.createInstance(CustomRenderer),
				instantiationService.createInstance(SkippedRenderer, (i) => this.loadFrame(i)),
			],
			{
				multipleSelectionSupport: false,
				mouseSupport: false,
				keyboardSupport: false,
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
		for (const frame of frames) {
			if (frame instanceof SkippedCallFrames) {
				result.push(frame);
				continue;
			}

			const wrapped = frame instanceof CustomStackFrame
				? new WrappedCustomStackFrame(frame) : new WrappedCallStackFrame(frame);
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

		if (e instanceof WrappedCustomStackFrame) {
			return e.original.label;
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
		if (element instanceof CallStackFrame || element instanceof WrappedCustomStackFrame) {
			return element.height.get();
		}
		if (element instanceof SkippedCallFrames) {
			return HEADER_HEIGHT;
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
		if (element instanceof WrappedCustomStackFrame) {
			return CustomRenderer.templateId;
		}

		assertNever(element);
	}
}

interface IStackTemplateData extends IAbstractFrameRendererTemplateData {
	editor: CodeEditorWidget;
	toolbar: MenuWorkbenchToolBar;
}

const editorOptions: IEditorOptions = {
	scrollBeyondLastLine: false,
	scrollbar: {
		vertical: 'hidden',
		horizontal: 'hidden',
		handleMouseWheel: false,
		useShadows: false,
	},
	overviewRulerLanes: 0,
	fixedOverflowWidgets: true,
	overviewRulerBorder: false,
	stickyScroll: { enabled: false },
	minimap: { enabled: false },
	readOnly: true,
	automaticLayout: false,
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

const HEADER_HEIGHT = 24;

interface IAbstractFrameRendererTemplateData {
	container: HTMLElement;
	label: ResourceLabel;
	elements: ReturnType<typeof makeFrameElements>;
	decorations: string[];
	collapse: Button;
	elementStore: DisposableStore;
	templateStore: DisposableStore;
}

abstract class AbstractFrameRenderer<T extends IAbstractFrameRendererTemplateData> implements IListRenderer<ListItem, T> {
	public abstract templateId: string;

	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
	) { }

	renderTemplate(container: HTMLElement): T {
		const elements = makeFrameElements();
		container.appendChild(elements.root);


		const templateStore = new DisposableStore();
		container.classList.add('multiCallStackFrameContainer');
		templateStore.add(toDisposable(() => {
			container.classList.remove('multiCallStackFrameContainer');
			elements.root.remove();
		}));

		const label = templateStore.add(this.instantiationService.createInstance(ResourceLabel, elements.title, {}));

		const collapse = templateStore.add(new Button(elements.collapseButton, {}));

		const contentId = generateUuid();
		elements.editor.id = contentId;
		elements.editor.role = 'region';
		elements.collapseButton.setAttribute('aria-controls', contentId);

		return this.finishRenderTemplate({
			container,
			decorations: [],
			elements,
			label,
			collapse,
			elementStore: templateStore.add(new DisposableStore()),
			templateStore,
		});
	}

	protected abstract finishRenderTemplate(data: IAbstractFrameRendererTemplateData): T;

	renderElement(element: ListItem, index: number, template: T, height: number | undefined): void {
		const { elementStore } = template;
		elementStore.clear();
		const item = element as IFrameLikeItem;

		this.setupCollapseButton(item, template);
	}

	private setupCollapseButton(item: IFrameLikeItem, { elementStore, elements, collapse }: T) {
		elementStore.add(autorun(reader => {
			collapse.element.className = '';
			const collapsed = item.collapsed.read(reader);
			collapse.icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
			collapse.element.ariaExpanded = String(!collapsed);
			elements.root.classList.toggle('collapsed', collapsed);
		}));
		elementStore.add(collapse.onDidClick(() => {
			item.collapsed.set(!item.collapsed.get(), undefined);
		}));
	}

	disposeElement(element: ListItem, index: number, templateData: T, height: number | undefined): void {
		templateData.elementStore.clear();
	}

	disposeTemplate(templateData: T): void {
		templateData.templateStore.dispose();
	}
}

const CONTEXT_LINES = 2;

/** Renderer for a normal stack frame where code is available. */
class FrameCodeRenderer extends AbstractFrameRenderer<IStackTemplateData> {
	public static readonly templateId = 'f';

	public readonly templateId = FrameCodeRenderer.templateId;

	constructor(
		private readonly containingEditor: ICodeEditor | undefined,
		private readonly onLayout: Event<void>,
		@ITextModelService private readonly modelService: ITextModelService,
		@ICodeEditorService private readonly editorService: ICodeEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(instantiationService);
	}

	protected override finishRenderTemplate(data: IAbstractFrameRendererTemplateData): IStackTemplateData {
		const editor = this.containingEditor
			? this.instantiationService.createInstance(
				EmbeddedCodeEditorWidget,
				data.elements.editor,
				editorOptions,
				{ isSimpleWidget: true },
				this.containingEditor,
			)
			: this.instantiationService.createInstance(
				CodeEditorWidget,
				data.elements.editor,
				editorOptions,
				{ isSimpleWidget: true },
			);

		data.templateStore.add(editor);

		const toolbar = data.templateStore.add(this.instantiationService.createInstance(MenuWorkbenchToolBar, data.elements.actions, MenuId.DebugCallStackToolbar, {
			menuOptions: { shouldForwardArgs: true },
			actionViewItemProvider: (action, options) => createActionViewItem(this.instantiationService, action, options),
		}));

		return { ...data, editor, toolbar };
	}

	override renderElement(element: ListItem, index: number, template: IStackTemplateData, height: number | undefined): void {
		super.renderElement(element, index, template, height);

		const { elementStore, editor } = template;

		const item = element as WrappedCallStackFrame;
		const uri = item.source!;

		template.label.element.setFile(uri);
		template.elements.title.role = 'link';
		elementStore.add(dom.addDisposableListener(template.elements.title, 'click', e => {
			this.editorService.openCodeEditor({
				resource: uri,
				options: {
					selection: Range.fromPositions({
						column: item.column ?? 1,
						lineNumber: item.line ?? 1,
					}),
					selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport,
				},
			}, this.containingEditor || null, e.ctrlKey || e.metaKey);
		}));

		const cts = new CancellationTokenSource();
		elementStore.add(toDisposable(() => cts.dispose(true)));
		this.modelService.createModelReference(uri).then(reference => {
			if (cts.token.isCancellationRequested) {
				return reference.dispose();
			}

			elementStore.add(reference);
			editor.setModel(reference.object.textEditorModel);
			this.setupEditorAfterModel(item, template);
			this.setupEditorLayout(item, template);
		});
	}

	private setupEditorLayout(item: WrappedCallStackFrame, { elementStore, container, editor }: IStackTemplateData) {
		const layout = () => {
			const prev = editor.getContentHeight();
			editor.layout({ width: container.clientWidth, height: prev });

			const next = editor.getContentHeight();
			if (next !== prev) {
				editor.layout({ width: container.clientWidth, height: next });
			}

			item.editorHeight.set(next, undefined);
		};
		elementStore.add(editor.onDidChangeModelDecorations(layout));
		elementStore.add(editor.onDidChangeModelContent(layout));
		elementStore.add(editor.onDidChangeModelOptions(layout));
		elementStore.add(this.onLayout(layout));
		layout();
	}

	private setupEditorAfterModel(item: WrappedCallStackFrame, template: IStackTemplateData): void {
		const range = Range.fromPositions({
			column: item.column ?? 1,
			lineNumber: item.line ?? 1,
		});

		template.toolbar.context = { uri: item.source, range };

		template.editor.setHiddenAreas([
			Range.fromPositions(
				{ column: 1, lineNumber: 1 },
				{ column: 1, lineNumber: Math.max(1, item.line - CONTEXT_LINES - 1) },
			),
			Range.fromPositions(
				{ column: 1, lineNumber: item.line + CONTEXT_LINES + 1 },
				{ column: 1, lineNumber: Constants.MAX_SAFE_SMALL_INTEGER },
			),
		]);

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

		item.editorHeight.set(template.editor.getContentHeight(), undefined);
	}
}

interface IMissingTemplateData {
	elements: ReturnType<typeof makeFrameElements>;
	label: ResourceLabel;
}

/** Renderer for a call frame that's missing a URI */
class MissingCodeRenderer implements IListRenderer<ListItem, IMissingTemplateData> {
	public static readonly templateId = 'm';
	public readonly templateId = MissingCodeRenderer.templateId;

	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) { }

	renderTemplate(container: HTMLElement): IMissingTemplateData {
		const elements = makeFrameElements();
		elements.root.classList.add('missing');
		container.appendChild(elements.root);
		const label = this.instantiationService.createInstance(ResourceLabel, elements.title, {});
		return { elements, label };
	}

	renderElement(element: ListItem, _index: number, templateData: IMissingTemplateData): void {
		const cast = element as CallStackFrame;
		templateData.label.element.setResource({
			name: cast.name,
			description: localize('stackFrameLocation', 'Line {0} column {1}', cast.line, cast.column),
			range: { startLineNumber: cast.line, startColumn: cast.column, endColumn: cast.column, endLineNumber: cast.line },
		}, {
			icon: Codicon.fileBinary,
		});
	}

	disposeTemplate(templateData: IMissingTemplateData): void {
		templateData.label.dispose();
		templateData.elements.root.remove();
	}
}

/** Renderer for a call frame that's missing a URI */
class CustomRenderer extends AbstractFrameRenderer<IAbstractFrameRendererTemplateData> {
	public static readonly templateId = 'c';
	public readonly templateId = CustomRenderer.templateId;

	protected override finishRenderTemplate(data: IAbstractFrameRendererTemplateData): IAbstractFrameRendererTemplateData {
		return data;
	}

	override renderElement(element: ListItem, index: number, template: IAbstractFrameRendererTemplateData, height: number | undefined): void {
		super.renderElement(element, index, template, height);

		const item = element as WrappedCustomStackFrame;
		const { elementStore, container, label } = template;

		label.element.setResource({ name: item.original.label }, { icon: item.original.icon });

		elementStore.add(autorun(reader => {
			template.elements.header.style.display = item.original.showHeader.read(reader) ? '' : 'none';
		}));

		elementStore.add(autorunWithStore((reader, store) => {
			if (!item.collapsed.read(reader)) {
				store.add(item.original.render(container));
			}
		}));

		const actions = item.original.renderActions?.(template.elements.actions);
		if (actions) {
			elementStore.add(actions);
		}
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
