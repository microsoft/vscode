/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Delayer } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { Event } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, IDisposable, IReference, MutableDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor, IDiffEditorConstructionOptions } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/embeddedCodeEditorWidget';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/embeddedDiffEditorWidget';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { IDiffEditorOptions, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { peekViewResultsBackground } from 'vs/editor/contrib/peekView/browser/peekView';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { formatMessageForTerminal } from 'vs/platform/terminal/common/terminalStrings';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { DetachedProcessInfo } from 'vs/workbench/contrib/terminal/browser/detachedTerminal';
import { IDetachedTerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { getXtermScaledDimensions } from 'vs/workbench/contrib/terminal/browser/xterm/xtermTerminal';
import { TERMINAL_BACKGROUND_COLOR } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';
import { colorizeTestMessageInEditor } from 'vs/workbench/contrib/testing/browser/testMessageColorizer';
import { InspectSubject, MessageSubject, TaskSubject, TestOutputSubject } from 'vs/workbench/contrib/testing/browser/testResultsView/testResultsSubject';
import { Testing } from 'vs/workbench/contrib/testing/common/constants';
import { MutableObservableValue } from 'vs/workbench/contrib/testing/common/observableValue';
import { ITaskRawOutput, ITestResult, ITestRunTaskResults, LiveTestResult, TestResultItemChangeReason } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestMessage, TestMessageType, getMarkId } from 'vs/workbench/contrib/testing/common/testTypes';


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
	/** Updates the displayed test. Should clear if it cannot display the test. */
	update(subject: InspectSubject): Promise<boolean>;
	/** Recalculate content layout. Returns the height it should be rendered at. */
	layout(dimension: dom.IDimension): number | undefined;
	/** Dispose the content provider. */
	dispose(): void;
}

const commonEditorOptions: IEditorOptions = {
	scrollBeyondLastLine: false,
	links: true,
	lineNumbers: 'off',
	glyphMargin: false,
	scrollbar: {
		verticalScrollbarSize: 14,
		horizontal: 'auto',
		useShadows: false,
		verticalHasArrows: false,
		horizontalHasArrows: false,
		alwaysConsumeMouseWheel: false
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

	public layout(dimensions: dom.IDimension) {
		this.dimension = dimensions;
		const editor = this.widget.value;
		if (!editor) {
			return;
		}

		editor.layout(dimensions);
		const height = Math.min(1000, Math.max(editor.getOriginalEditor().getContentHeight(), editor.getModifiedEditor().getContentHeight()));
		editor.layout({ height, width: dimensions.width });
		return height;
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

	private element?: HTMLElement;

	constructor(private readonly container: HTMLElement, @IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
		this._register(toDisposable(() => this.clear()));
	}

	public async update(subject: InspectSubject) {
		if (!(subject instanceof MessageSubject)) {
			this.clear();
			return false;
		}

		const message = subject.message;
		if (ITestMessage.isDiffable(message) || typeof message.message === 'string') {
			this.clear();
			return false;
		}


		const rendered = this._register(this.markdown.value.render(message.message, {}));
		rendered.element.style.height = '100%';
		rendered.element.style.userSelect = 'text';
		rendered.element.classList.add('preview-text');
		this.container.appendChild(rendered.element);
		this.element = rendered.element;
		return true;
	}

	public layout(dimension: dom.IDimension): number | undefined {
		if (!this.element) {
			return undefined;
		}

		this.element.style.width = `${dimension.width}px`;
		return this.element.clientHeight;
	}

	private clear() {
		if (this.element) {
			this.element.remove();
			this.element = undefined;
		}
	}
}

export class PlainTextMessagePeek extends Disposable implements IPeekOutputRenderer {
	private readonly widgetDecorations = this._register(new MutableDisposable());
	private readonly widget = this._register(new MutableDisposable<CodeEditorWidget>());
	private readonly model = this._register(new MutableDisposable());
	private dimension?: dom.IDimension;

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

	public layout(dimensions: dom.IDimension) {
		this.dimension = dimensions;
		const editor = this.widget.value;
		if (!editor) {
			return;
		}

		editor.layout(dimensions);
		const height = editor.getContentHeight();
		editor.layout({ height, width: dimensions.width });
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
			// clearBuffer tries to retain the prompt line, but this doesn't exist for tests.
			// So clear the screen (J) and move to home (H) to ensure previous data is cleaned up.
			prev.xterm.write(`\x1b[2J\x1b[0;0H`);
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
