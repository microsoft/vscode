/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Delayer } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, DisposableStore, IDisposable, IReference, MutableDisposable, combinedDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditor, IDiffEditorConstructionOptions } from '../../../../../editor/browser/editorBrowser.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EmbeddedCodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { DiffEditorWidget } from '../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { EmbeddedDiffEditorWidget } from '../../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IDiffEditorOptions, IEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { peekViewResultsBackground } from '../../../../../editor/contrib/peekView/browser/peekView.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { formatMessageForTerminal } from '../../../../../platform/terminal/common/terminalStrings.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { EditorModel } from '../../../../common/editor/editorModel.js';
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from '../../../../common/theme.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { DetachedProcessInfo } from '../../../terminal/browser/detachedTerminal.js';
import { IDetachedTerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { getXtermScaledDimensions } from '../../../terminal/browser/xterm/xtermTerminal.js';
import { TERMINAL_BACKGROUND_COLOR } from '../../../terminal/common/terminalColorRegistry.js';
import { colorizeTestMessageInEditor } from '../testMessageColorizer.js';
import { InspectSubject, MessageSubject, TaskSubject, TestOutputSubject } from './testResultsSubject.js';
import { Testing } from '../../common/constants.js';
import { MutableObservableValue } from '../../common/observableValue.js';
import { ITaskRawOutput, ITestResult, ITestRunTaskResults, LiveTestResult, TestResultItemChangeReason } from '../../common/testResult.js';
import { ITestMessage, TestMessageType, getMarkId } from '../../common/testTypes.js';
import { ScrollEvent } from '../../../../../base/common/scrollable.js';
import { CALL_STACK_WIDGET_HEADER_HEIGHT } from '../../../debug/browser/callStackWidget.js';


class SimpleDiffEditorModel extends EditorModel {
	public readonly original = this._original.object.textEditorModel;
	public readonly modified = this._modified.object.textEditorModel;

	constructor(
		private readonly _original: IReference<IResolvedTextEditorModel>,
		private readonly _modified: IReference<IResolvedTextEditorModel>,
	) {
		super();
	}

	public override dispose() {
		super.dispose();
		this._original.dispose();
		this._modified.dispose();
	}
}


export interface IPeekOutputRenderer extends IDisposable {
	onDidContentSizeChange?: Event<void>;
	onScrolled?(evt: ScrollEvent): void;
	/** Updates the displayed test. Should clear if it cannot display the test. */
	update(subject: InspectSubject): Promise<boolean>;
	/** Recalculate content layout. Returns the height it should be rendered at. */
	layout(dimension: dom.IDimension, hasMultipleFrames: boolean): number | undefined;
	/** Dispose the content provider. */
	dispose(): void;
}

const commonEditorOptions: IEditorOptions = {
	scrollBeyondLastLine: false,
	links: true,
	lineNumbers: 'off',
	glyphMargin: false,
	scrollbar: {
		vertical: 'hidden',
		horizontal: 'auto',
		useShadows: false,
		verticalHasArrows: false,
		horizontalHasArrows: false,
		handleMouseWheel: false,
	},
	overviewRulerLanes: 0,
	fixedOverflowWidgets: true,
	readOnly: true,
	stickyScroll: { enabled: false },
	minimap: { enabled: false },
	automaticLayout: false,
};

const diffEditorOptions: IDiffEditorConstructionOptions = {
	...commonEditorOptions,
	enableSplitViewResizing: true,
	isInEmbeddedEditor: true,
	renderOverviewRuler: false,
	ignoreTrimWhitespace: false,
	renderSideBySide: true,
	useInlineViewWhenSpaceIsLimited: false,
	originalAriaLabel: localize('testingOutputExpected', 'Expected result'),
	modifiedAriaLabel: localize('testingOutputActual', 'Actual result'),
	diffAlgorithm: 'advanced',
};


export class DiffContentProvider extends Disposable implements IPeekOutputRenderer {
	private readonly widget = this._register(new MutableDisposable<DiffEditorWidget>());
	private readonly model = this._register(new MutableDisposable());
	private dimension?: dom.IDimension;
	private helper?: ScrollHelper;

	public get onDidContentSizeChange() {
		return this.widget.value?.onDidContentSizeChange || Event.None;
	}

	constructor(
		private readonly editor: ICodeEditor | undefined,
		private readonly container: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly modelService: ITextModelService,
	) {
		super();
	}

	public async update(subject: InspectSubject) {
		if (!(subject instanceof MessageSubject)) {
			this.clear();
			return false;
		}
		const message = subject.message;
		if (!ITestMessage.isDiffable(message)) {
			this.clear();
			return false;
		}

		const [original, modified] = await Promise.all([
			this.modelService.createModelReference(subject.expectedUri),
			this.modelService.createModelReference(subject.actualUri),
		]);

		const model = this.model.value = new SimpleDiffEditorModel(original, modified);
		if (!this.widget.value) {
			this.widget.value = this.editor ? this.instantiationService.createInstance(
				EmbeddedDiffEditorWidget,
				this.container,
				diffEditorOptions,
				{},
				this.editor,
			) : this.instantiationService.createInstance(
				DiffEditorWidget,
				this.container,
				diffEditorOptions,
				{},
			);

			if (this.dimension) {
				this.widget.value.layout(this.dimension);
			}
		}

		this.widget.value.setModel(model);
		this.widget.value.updateOptions(this.getOptions(
			isMultiline(message.expected) || isMultiline(message.actual)
		));

		return true;
	}

	private clear() {
		this.model.clear();
		this.widget.clear();
	}

	public layout(dimensions: dom.IDimension, hasMultipleFrames: boolean) {
		this.dimension = dimensions;
		const editor = this.widget.value;
		if (!editor) {
			return;
		}

		editor.layout(dimensions);
		const height = Math.max(
			editor.getOriginalEditor().getContentHeight(),
			editor.getModifiedEditor().getContentHeight()
		);
		this.helper = new ScrollHelper(hasMultipleFrames, height, dimensions.height);
		return height;
	}

	public onScrolled(evt: ScrollEvent): void {
		this.helper?.onScrolled(evt, this.widget.value?.getDomNode(), this.widget.value?.getOriginalEditor());
	}

	protected getOptions(isMultiline: boolean): IDiffEditorOptions {
		return isMultiline
			? { ...diffEditorOptions, lineNumbers: 'on' }
			: { ...diffEditorOptions, lineNumbers: 'off' };
	}
}


export class MarkdownTestMessagePeek extends Disposable implements IPeekOutputRenderer {
	private readonly markdown = new Lazy(
		() => this._register(this.instantiationService.createInstance(MarkdownRenderer, {})),
	);
	private readonly rendered = this._register(new DisposableStore());

	private element?: HTMLElement;

	constructor(private readonly container: HTMLElement, @IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
		this._register(toDisposable(() => this.clear()));
	}

	public async update(subject: InspectSubject) {
		this.clear();
		if (!(subject instanceof MessageSubject)) {
			return false;
		}

		const message = subject.message;
		if (ITestMessage.isDiffable(message) || typeof message.message === 'string') {
			return false;
		}


		const rendered = this.rendered.add(this.markdown.value.render(message.message, {}));
		rendered.element.style.userSelect = 'text';
		rendered.element.classList.add('preview-text');
		this.container.appendChild(rendered.element);
		this.element = rendered.element;
		this.rendered.add(toDisposable(() => rendered.element.remove()));

		return true;
	}

	public layout(dimension: dom.IDimension): number | undefined {
		if (!this.element) {
			return undefined;
		}

		this.element.style.width = `${dimension.width - 32}px`;
		return this.element.clientHeight;
	}

	private clear() {
		this.rendered.clear();
		this.element = undefined;
	}
}

class ScrollHelper {
	constructor(
		private readonly hasMultipleFrames: boolean,
		private readonly contentHeight: number,
		private readonly viewHeight: number,
	) { }

	public onScrolled(evt: ScrollEvent, container: HTMLElement | undefined | null, editor: ICodeEditor | undefined) {
		if (!editor || !container) {
			return;
		}

		let delta = Math.max(0, evt.scrollTop - (this.hasMultipleFrames ? CALL_STACK_WIDGET_HEADER_HEIGHT : 0));
		delta = Math.min(Math.max(0, this.contentHeight - this.viewHeight), delta);

		editor.setScrollTop(delta);
		container.style.transform = `translateY(${delta}px)`;
	}
}

export class PlainTextMessagePeek extends Disposable implements IPeekOutputRenderer {
	private readonly widgetDecorations = this._register(new MutableDisposable());
	private readonly widget = this._register(new MutableDisposable<CodeEditorWidget>());
	private readonly model = this._register(new MutableDisposable());
	private dimension?: dom.IDimension;
	private helper?: ScrollHelper;

	public get onDidContentSizeChange() {
		return this.widget.value?.onDidContentSizeChange || Event.None;
	}

	constructor(
		private readonly editor: ICodeEditor | undefined,
		private readonly container: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly modelService: ITextModelService,
	) {
		super();
	}

	public async update(subject: InspectSubject): Promise<boolean> {
		if (!(subject instanceof MessageSubject)) {
			this.clear();
			return false;
		}

		const message = subject.message;
		if (ITestMessage.isDiffable(message) || message.type === TestMessageType.Output || typeof message.message !== 'string') {
			this.clear();
			return false;
		}

		const modelRef = this.model.value = await this.modelService.createModelReference(subject.messageUri);
		if (!this.widget.value) {
			this.widget.value = this.editor ? this.instantiationService.createInstance(
				EmbeddedCodeEditorWidget,
				this.container,
				commonEditorOptions,
				{},
				this.editor,
			) : this.instantiationService.createInstance(
				CodeEditorWidget,
				this.container,
				commonEditorOptions,
				{ isSimpleWidget: true }
			);

			if (this.dimension) {
				this.widget.value.layout(this.dimension);
			}
		}

		this.widget.value.setModel(modelRef.object.textEditorModel);
		this.widget.value.updateOptions(commonEditorOptions);
		this.widgetDecorations.value = colorizeTestMessageInEditor(message.message, this.widget.value);
		return true;
	}

	private clear() {
		this.widgetDecorations.clear();
		this.widget.clear();
		this.model.clear();
	}

	onScrolled(evt: ScrollEvent): void {
		this.helper?.onScrolled(evt, this.widget.value?.getDomNode(), this.widget.value);
	}

	public layout(dimensions: dom.IDimension, hasMultipleFrames: boolean) {
		this.dimension = dimensions;
		const editor = this.widget.value;
		if (!editor) {
			return;
		}

		editor.layout(dimensions);
		const height = editor.getContentHeight();
		this.helper = new ScrollHelper(hasMultipleFrames, height, dimensions.height);
		return height;
	}
}

export class TerminalMessagePeek extends Disposable implements IPeekOutputRenderer {
	private dimensions?: dom.IDimension;
	private readonly terminalCwd = this._register(new MutableObservableValue<string>(''));
	private readonly xtermLayoutDelayer = this._register(new Delayer(50));

	/** Active terminal instance. */
	private readonly terminal = this._register(new MutableDisposable<IDetachedTerminalInstance>());
	/** Listener for streaming result data */
	private readonly outputDataListener = this._register(new MutableDisposable());

	constructor(
		private readonly container: HTMLElement,
		private readonly isInPeekView: boolean,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IWorkspaceContextService private readonly workspaceContext: IWorkspaceContextService,
	) {
		super();
	}

	private async makeTerminal() {
		const prev = this.terminal.value;
		if (prev) {
			prev.xterm.clearBuffer();
			prev.xterm.clearSearchDecorations();
			// clearBuffer tries to retain the prompt. Reset prompt, scrolling state, etc.
			prev.xterm.write(`\x1bc`);
			return prev;
		}

		const capabilities = new TerminalCapabilityStore();
		const cwd = this.terminalCwd;
		capabilities.add(TerminalCapability.CwdDetection, {
			type: TerminalCapability.CwdDetection,
			get cwds() { return [cwd.value]; },
			onDidChangeCwd: cwd.onDidChange,
			getCwd: () => cwd.value,
			updateCwd: () => { },
		});

		return this.terminal.value = await this.terminalService.createDetachedTerminal({
			rows: 10,
			cols: 80,
			readonly: true,
			capabilities,
			processInfo: new DetachedProcessInfo({ initialCwd: cwd.value }),
			colorProvider: {
				getBackgroundColor: theme => {
					const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR);
					if (terminalBackground) {
						return terminalBackground;
					}
					if (this.isInPeekView) {
						return theme.getColor(peekViewResultsBackground);
					}
					const location = this.viewDescriptorService.getViewLocationById(Testing.ResultsViewId);
					return location === ViewContainerLocation.Panel
						? theme.getColor(PANEL_BACKGROUND)
						: theme.getColor(SIDE_BAR_BACKGROUND);
				},
			}
		});
	}

	public async update(subject: InspectSubject): Promise<boolean> {
		this.outputDataListener.clear();
		if (subject instanceof TaskSubject) {
			await this.updateForTaskSubject(subject);
		} else if (subject instanceof TestOutputSubject || (subject instanceof MessageSubject && subject.message.type === TestMessageType.Output)) {
			await this.updateForTestSubject(subject);
		} else {
			this.clear();
			return false;
		}

		return true;
	}

	private async updateForTestSubject(subject: TestOutputSubject | MessageSubject) {
		const that = this;
		const testItem = subject instanceof TestOutputSubject ? subject.test.item : subject.test;
		const terminal = await this.updateGenerically<ITaskRawOutput>({
			subject,
			noOutputMessage: localize('caseNoOutput', 'The test case did not report any output.'),
			getTarget: result => result?.tasks[subject.taskIndex].output,
			*doInitialWrite(output, results) {
				that.updateCwd(testItem.uri);
				const state = subject instanceof TestOutputSubject ? subject.test : results.getStateById(testItem.extId);
				if (!state) {
					return;
				}

				for (const message of state.tasks[subject.taskIndex].messages) {
					if (message.type === TestMessageType.Output) {
						yield* output.getRangeIter(message.offset, message.length);
					}
				}
			},
			doListenForMoreData: (output, result, write) => result.onChange(e => {
				if (e.reason === TestResultItemChangeReason.NewMessage && e.item.item.extId === testItem.extId && e.message.type === TestMessageType.Output) {
					for (const chunk of output.getRangeIter(e.message.offset, e.message.length)) {
						write(chunk.buffer);
					}
				}
			}),
		});

		if (subject instanceof MessageSubject && subject.message.type === TestMessageType.Output && subject.message.marker !== undefined) {
			terminal?.xterm.selectMarkedRange(getMarkId(subject.message.marker, true), getMarkId(subject.message.marker, false), /* scrollIntoView= */ true);
		}
	}

	private updateForTaskSubject(subject: TaskSubject) {
		return this.updateGenerically<ITestRunTaskResults>({
			subject,
			noOutputMessage: localize('runNoOutput', 'The test run did not record any output.'),
			getTarget: result => result?.tasks[subject.taskIndex],
			doInitialWrite: (task, result) => {
				// Update the cwd and use the first test to try to hint at the correct cwd,
				// but often this will fall back to the first workspace folder.
				this.updateCwd(Iterable.find(result.tests, t => !!t.item.uri)?.item.uri);
				return task.output.buffers;
			},
			doListenForMoreData: (task, _result, write) => task.output.onDidWriteData(e => write(e.buffer)),
		});
	}

	private async updateGenerically<T>(opts: {
		subject: InspectSubject;
		noOutputMessage: string;
		getTarget: (result: ITestResult) => T | undefined;
		doInitialWrite: (target: T, result: LiveTestResult) => Iterable<VSBuffer>;
		doListenForMoreData: (target: T, result: LiveTestResult, write: (s: Uint8Array) => void) => IDisposable;
	}) {
		const result = opts.subject.result;
		const target = opts.getTarget(result);
		if (!target) {
			return this.clear();
		}

		const terminal = await this.makeTerminal();
		let didWriteData = false;

		const pendingWrites = new MutableObservableValue(0);
		if (result instanceof LiveTestResult) {
			for (const chunk of opts.doInitialWrite(target, result)) {
				didWriteData ||= chunk.byteLength > 0;
				pendingWrites.value++;
				terminal.xterm.write(chunk.buffer, () => pendingWrites.value--);
			}
		} else {
			didWriteData = true;
			this.writeNotice(terminal, localize('runNoOutputForPast', 'Test output is only available for new test runs.'));
		}

		this.attachTerminalToDom(terminal);
		this.outputDataListener.clear();

		if (result instanceof LiveTestResult && !result.completedAt) {
			const l1 = result.onComplete(() => {
				if (!didWriteData) {
					this.writeNotice(terminal, opts.noOutputMessage);
				}
			});
			const l2 = opts.doListenForMoreData(target, result, data => {
				terminal.xterm.write(data);
				didWriteData ||= data.byteLength > 0;
			});

			this.outputDataListener.value = combinedDisposable(l1, l2);
		}

		if (!this.outputDataListener.value && !didWriteData) {
			this.writeNotice(terminal, opts.noOutputMessage);
		}

		// Ensure pending writes finish, otherwise the selection in `updateForTestSubject`
		// can happen before the markers are processed.
		if (pendingWrites.value > 0) {
			await new Promise<void>(resolve => {
				const l = pendingWrites.onDidChange(() => {
					if (pendingWrites.value === 0) {
						l.dispose();
						resolve();
					}
				});
			});
		}

		return terminal;
	}

	private updateCwd(testUri?: URI) {
		const wf = (testUri && this.workspaceContext.getWorkspaceFolder(testUri))
			|| this.workspaceContext.getWorkspace().folders[0];
		if (wf) {
			this.terminalCwd.value = wf.uri.fsPath;
		}
	}

	private writeNotice(terminal: IDetachedTerminalInstance, str: string) {
		terminal.xterm.write(formatMessageForTerminal(str));
	}

	private attachTerminalToDom(terminal: IDetachedTerminalInstance) {
		terminal.xterm.write('\x1b[?25l'); // hide cursor
		dom.scheduleAtNextAnimationFrame(dom.getWindow(this.container), () => this.layoutTerminal(terminal));
		terminal.attachToElement(this.container, { enableGpu: false });
	}

	private clear() {
		this.outputDataListener.clear();
		this.xtermLayoutDelayer.cancel();
		this.terminal.clear();
	}

	public layout(dimensions: dom.IDimension) {
		this.dimensions = dimensions;
		if (this.terminal.value) {
			this.layoutTerminal(this.terminal.value, dimensions.width, dimensions.height);
			return dimensions.height;
		}

		return undefined;
	}

	private layoutTerminal(
		{ xterm }: IDetachedTerminalInstance,
		width = this.dimensions?.width ?? this.container.clientWidth,
		height = this.dimensions?.height ?? this.container.clientHeight
	) {
		width -= 10 + 20; // scrollbar width + margin
		this.xtermLayoutDelayer.trigger(() => {
			const scaled = getXtermScaledDimensions(dom.getWindow(this.container), xterm.getFont(), width, height);
			if (scaled) {
				xterm.resize(scaled.cols, scaled.rows);
			}
		});
	}
}

const isMultiline = (str: string | undefined) => !!str && str.includes('\n');
