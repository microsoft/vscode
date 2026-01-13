/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './output.css';
import * as nls from '../../../../nls.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IEditorOptions as ICodeEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService, IContextKey, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { AbstractTextResourceEditor } from '../../../browser/parts/editor/textResourceEditor.js';
import { OUTPUT_VIEW_ID, CONTEXT_IN_OUTPUT, IOutputChannel, CONTEXT_OUTPUT_SCROLL_LOCK, IOutputService, IOutputViewFilters, OUTPUT_FILTER_FOCUS_CONTEXT, ILogEntry, HIDE_CATEGORY_FILTER_CONTEXT } from '../../../services/output/common/output.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { CursorChangeReason } from '../../../../editor/common/cursorEvents.js';
import { IViewPaneOptions, FilterViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { TextResourceEditorInput } from '../../../common/editor/textResourceEditorInput.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { CancelablePromise, createCancelablePromise } from '../../../../base/common/async.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IEditorConfiguration } from '../../../browser/parts/editor/textEditor.js';
import { computeEditorAriaLabel } from '../../../browser/editor.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { localize } from '../../../../nls.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { LogLevel } from '../../../../platform/log/common/log.js';
import { IEditorContributionDescription, EditorExtensionsRegistry, EditorContributionInstantiation, EditorContributionCtor } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorContribution, IEditorDecorationsCollection } from '../../../../editor/common/editorCommon.js';
import { IModelDeltaDecoration, ITextModel } from '../../../../editor/common/model.js';
import { Range } from '../../../../editor/common/core/range.js';
import { FindDecorations } from '../../../../editor/contrib/find/browser/findDecorations.js';
import { Memento } from '../../../common/memento.js';
import { Markers } from '../../markers/common/markers.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { viewFilterSubmenu } from '../../../browser/parts/views/viewFilter.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';

interface IOutputViewState {
	filter?: string;
	showTrace?: boolean;
	showDebug?: boolean;
	showInfo?: boolean;
	showWarning?: boolean;
	showError?: boolean;
	categories?: string;
}

export class OutputViewPane extends FilterViewPane {

	private readonly editor: OutputEditor;
	private channelId: string | undefined;
	private editorPromise: CancelablePromise<void> | null = null;

	private readonly scrollLockContextKey: IContextKey<boolean>;
	get scrollLock(): boolean { return !!this.scrollLockContextKey.get(); }
	set scrollLock(scrollLock: boolean) { this.scrollLockContextKey.set(scrollLock); }

	private readonly memento: Memento<IOutputViewState>;
	private readonly panelState: IOutputViewState;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IOutputService private readonly outputService: IOutputService,
		@IStorageService storageService: IStorageService,
	) {
		const memento = new Memento<IOutputViewState>(Markers.MARKERS_VIEW_STORAGE_ID, storageService);
		const viewState = memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		super({
			...options,
			filterOptions: {
				placeholder: localize('outputView.filter.placeholder', "Filter (e.g. text, !excludeText, text1,text2)"),
				focusContextKey: OUTPUT_FILTER_FOCUS_CONTEXT.key,
				text: viewState.filter || '',
				history: []
			}
		}, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this.memento = memento;
		this.panelState = viewState;

		const filters = outputService.filters;
		filters.text = this.panelState.filter || '';
		filters.trace = this.panelState.showTrace ?? true;
		filters.debug = this.panelState.showDebug ?? true;
		filters.info = this.panelState.showInfo ?? true;
		filters.warning = this.panelState.showWarning ?? true;
		filters.error = this.panelState.showError ?? true;
		filters.categories = this.panelState.categories ?? '';

		this.scrollLockContextKey = CONTEXT_OUTPUT_SCROLL_LOCK.bindTo(this.contextKeyService);

		const editorInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
		this.editor = this._register(editorInstantiationService.createInstance(OutputEditor));
		this._register(this.editor.onTitleAreaUpdate(() => {
			this.updateTitle(this.editor.getTitle());
			this.updateActions();
		}));
		this._register(this.onDidChangeBodyVisibility(() => this.onDidChangeVisibility(this.isBodyVisible())));
		this._register(this.filterWidget.onDidChangeFilterText(text => outputService.filters.text = text));

		this.checkMoreFilters();
		this._register(outputService.filters.onDidChange(() => this.checkMoreFilters()));
	}

	showChannel(channel: IOutputChannel, preserveFocus: boolean): void {
		if (this.channelId !== channel.id) {
			this.setInput(channel);
		}
		if (!preserveFocus) {
			this.focus();
		}
	}

	override focus(): void {
		super.focus();
		this.editorPromise?.then(() => this.editor.focus());
	}

	public clearFilterText(): void {
		this.filterWidget.setFilterText('');
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.editor.create(container);
		container.classList.add('output-view');
		const codeEditor = <ICodeEditor>this.editor.getControl();
		codeEditor.setAriaOptions({ role: 'document', activeDescendant: undefined });
		this._register(codeEditor.onDidChangeModelContent(() => {
			if (!this.scrollLock) {
				this.editor.revealLastLine();
			}
		}));
		this._register(codeEditor.onDidChangeCursorPosition((e) => {
			if (e.reason !== CursorChangeReason.Explicit) {
				return;
			}

			if (!this.configurationService.getValue('output.smartScroll.enabled')) {
				return;
			}

			const model = codeEditor.getModel();
			if (model) {
				const newPositionLine = e.position.lineNumber;
				const lastLine = model.getLineCount();
				this.scrollLock = lastLine !== newPositionLine;
			}
		}));
	}

	protected layoutBodyContent(height: number, width: number): void {
		this.editor.layout(new Dimension(width, height));
	}

	private onDidChangeVisibility(visible: boolean): void {
		this.editor.setVisible(visible);
		if (!visible) {
			this.clearInput();
		}
	}

	private setInput(channel: IOutputChannel): void {
		this.channelId = channel.id;
		this.checkMoreFilters();

		const input = this.createInput(channel);
		if (!this.editor.input || !input.matches(this.editor.input)) {
			this.editorPromise?.cancel();
			this.editorPromise = createCancelablePromise(token => this.editor.setInput(input, { preserveFocus: true }, Object.create(null), token));
		}

	}

	private checkMoreFilters(): void {
		const filters = this.outputService.filters;
		this.filterWidget.checkMoreFilters(!filters.trace || !filters.debug || !filters.info || !filters.warning || !filters.error || (!!this.channelId && filters.categories.includes(`,${this.channelId}:`)));
	}

	private clearInput(): void {
		this.channelId = undefined;
		this.editor.clearInput();
		this.editorPromise = null;
	}

	private createInput(channel: IOutputChannel): TextResourceEditorInput {
		return this.instantiationService.createInstance(TextResourceEditorInput, channel.uri, nls.localize('output model title', "{0} - Output", channel.label), nls.localize('channel', "Output channel for '{0}'", channel.label), undefined, undefined);
	}

	override saveState(): void {
		const filters = this.outputService.filters;
		this.panelState.filter = filters.text;
		this.panelState.showTrace = filters.trace;
		this.panelState.showDebug = filters.debug;
		this.panelState.showInfo = filters.info;
		this.panelState.showWarning = filters.warning;
		this.panelState.showError = filters.error;
		this.panelState.categories = filters.categories;

		this.memento.saveMemento();
		super.saveState();
	}

}

export class OutputEditor extends AbstractTextResourceEditor {
	private readonly resourceContext: ResourceContextKey;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IFileService fileService: IFileService
	) {
		super(OUTPUT_VIEW_ID, editorGroupService.activeGroup /* this is not correct but pragmatic */, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorGroupService, editorService, fileService);

		this.resourceContext = this._register(instantiationService.createInstance(ResourceContextKey));
	}

	override getId(): string {
		return OUTPUT_VIEW_ID;
	}

	override getTitle(): string {
		return nls.localize('output', "Output");
	}

	protected override getConfigurationOverrides(configuration: IEditorConfiguration): ICodeEditorOptions {
		const options = super.getConfigurationOverrides(configuration);
		options.wordWrap = 'on';				// all output editors wrap
		options.lineNumbers = 'off';			// all output editors hide line numbers
		options.glyphMargin = false;
		options.lineDecorationsWidth = 20;
		options.rulers = [];
		options.folding = false;
		options.scrollBeyondLastLine = false;
		options.renderLineHighlight = 'none';
		options.minimap = { enabled: false };
		options.renderValidationDecorations = 'editable';
		options.padding = undefined;
		options.readOnly = true;
		options.domReadOnly = true;
		options.unicodeHighlight = {
			nonBasicASCII: false,
			invisibleCharacters: false,
			ambiguousCharacters: false,
		};

		const outputConfig = this.configurationService.getValue<{ 'editor.minimap.enabled'?: boolean; 'editor.wordWrap'?: 'off' | 'on' | 'wordWrapColumn' | 'bounded' }>('[Log]');
		if (outputConfig) {
			if (outputConfig['editor.minimap.enabled']) {
				options.minimap = { enabled: true };
			}
			if (outputConfig['editor.wordWrap']) {
				options.wordWrap = outputConfig['editor.wordWrap'];
			}
		}

		return options;
	}

	protected getAriaLabel(): string {
		return this.input ? this.input.getAriaLabel() : nls.localize('outputViewAriaLabel', "Output panel");
	}

	protected override computeAriaLabel(): string {
		return this.input ? computeEditorAriaLabel(this.input, undefined, undefined, this.editorGroupService.count) : this.getAriaLabel();
	}

	override async setInput(input: TextResourceEditorInput, options: ITextEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		const focus = !(options && options.preserveFocus);
		if (this.input && input.matches(this.input)) {
			return;
		}

		if (this.input) {
			// Dispose previous input (Output panel is not a workbench editor)
			this.input.dispose();
		}
		await super.setInput(input, options, context, token);

		this.resourceContext.set(input.resource);

		if (focus) {
			this.focus();
		}
		this.revealLastLine();
	}

	override clearInput(): void {
		if (this.input) {
			// Dispose current input (Output panel is not a workbench editor)
			this.input.dispose();
		}
		super.clearInput();

		this.resourceContext.reset();
	}

	protected override createEditor(parent: HTMLElement): void {

		parent.setAttribute('role', 'document');

		super.createEditor(parent);

		const scopedContextKeyService = this.scopedContextKeyService;
		if (scopedContextKeyService) {
			CONTEXT_IN_OUTPUT.bindTo(scopedContextKeyService).set(true);
		}
	}

	private _getContributions(): IEditorContributionDescription[] {
		return [
			...EditorExtensionsRegistry.getEditorContributions(),
			{
				id: FilterController.ID,
				ctor: FilterController as EditorContributionCtor,
				instantiation: EditorContributionInstantiation.Eager
			}
		];
	}

	protected override getCodeEditorWidgetOptions(): ICodeEditorWidgetOptions {
		return { contributions: this._getContributions() };
	}

}

export class FilterController extends Disposable implements IEditorContribution {

	public static readonly ID = 'output.editor.contrib.filterController';

	private readonly modelDisposables: DisposableStore = this._register(new DisposableStore());
	private hiddenAreas: Range[] = [];
	private readonly categories = new Map<string, string>();
	private readonly decorationsCollection: IEditorDecorationsCollection;

	constructor(
		private readonly editor: ICodeEditor,
		@IOutputService private readonly outputService: IOutputService,
	) {
		super();
		this.decorationsCollection = editor.createDecorationsCollection();
		this._register(editor.onDidChangeModel(() => this.onDidChangeModel()));
		this._register(this.outputService.filters.onDidChange(() => editor.hasModel() && this.filter(editor.getModel())));
	}

	private onDidChangeModel(): void {
		this.modelDisposables.clear();
		this.hiddenAreas = [];
		this.categories.clear();

		if (!this.editor.hasModel()) {
			return;
		}

		const model = this.editor.getModel();
		this.filter(model);

		const computeEndLineNumber = () => {
			const endLineNumber = model.getLineCount();
			return endLineNumber > 1 && model.getLineMaxColumn(endLineNumber) === 1 ? endLineNumber - 1 : endLineNumber;
		};

		let endLineNumber = computeEndLineNumber();

		this.modelDisposables.add(model.onDidChangeContent(e => {
			if (e.changes.every(e => e.range.startLineNumber > endLineNumber)) {
				this.filterIncremental(model, endLineNumber + 1);
			} else {
				this.filter(model);
			}
			endLineNumber = computeEndLineNumber();
		}));
	}

	private filter(model: ITextModel): void {
		this.hiddenAreas = [];
		this.decorationsCollection.clear();
		this.filterIncremental(model, 1);
	}

	private filterIncremental(model: ITextModel, fromLineNumber: number): void {
		const { findMatches, hiddenAreas, categories: sources } = this.compute(model, fromLineNumber);
		this.hiddenAreas.push(...hiddenAreas);
		this.editor.setHiddenAreas(this.hiddenAreas, this);
		if (findMatches.length) {
			this.decorationsCollection.append(findMatches);
		}
		if (sources.size) {
			const that = this;
			for (const [categoryFilter, categoryName] of sources) {
				if (this.categories.has(categoryFilter)) {
					continue;
				}
				this.categories.set(categoryFilter, categoryName);
				this.modelDisposables.add(registerAction2(class extends Action2 {
					constructor() {
						super({
							id: `workbench.actions.${OUTPUT_VIEW_ID}.toggle.${categoryFilter}`,
							title: categoryName,
							toggled: ContextKeyExpr.regex(HIDE_CATEGORY_FILTER_CONTEXT.key, new RegExp(`.*,${escapeRegExpCharacters(categoryFilter)},.*`)).negate(),
							menu: {
								id: viewFilterSubmenu,
								group: '1_category_filter',
								when: ContextKeyExpr.and(ContextKeyExpr.equals('view', OUTPUT_VIEW_ID)),
							}
						});
					}
					async run(): Promise<void> {
						that.outputService.filters.toggleCategory(categoryFilter);
					}
				}));
			}
		}
	}

	private shouldShowLine(model: ITextModel, range: Range, positive: string[], negative: string[]): { show: boolean; matches: IModelDeltaDecoration[] } {
		const matches: IModelDeltaDecoration[] = [];

		// Check negative filters first - if any match, hide the line
		if (negative.length > 0) {
			for (const pattern of negative) {
				const negativeMatches = model.findMatches(pattern, range, false, false, null, false);
				if (negativeMatches.length > 0) {
					return { show: false, matches: [] };
				}
			}
		}

		// If there are positive filters, at least one must match
		if (positive.length > 0) {
			let hasPositiveMatch = false;
			for (const pattern of positive) {
				const positiveMatches = model.findMatches(pattern, range, false, false, null, false);
				if (positiveMatches.length > 0) {
					hasPositiveMatch = true;
					for (const match of positiveMatches) {
						matches.push({ range: match.range, options: FindDecorations._FIND_MATCH_DECORATION });
					}
				}
			}
			return { show: hasPositiveMatch, matches };
		}

		// No positive filters means show everything (that passed negative filters)
		return { show: true, matches };
	}

	private compute(model: ITextModel, fromLineNumber: number): { findMatches: IModelDeltaDecoration[]; hiddenAreas: Range[]; categories: Map<string, string> } {
		const filters = this.outputService.filters;
		const activeChannel = this.outputService.getActiveChannel();
		const findMatches: IModelDeltaDecoration[] = [];
		const hiddenAreas: Range[] = [];
		const categories = new Map<string, string>();

		const logEntries = activeChannel?.getLogEntries();
		if (activeChannel && logEntries?.length) {
			const hasLogLevelFilter = !filters.trace || !filters.debug || !filters.info || !filters.warning || !filters.error;

			const fromLogLevelEntryIndex = logEntries.findIndex(entry => fromLineNumber >= entry.range.startLineNumber && fromLineNumber <= entry.range.endLineNumber);
			if (fromLogLevelEntryIndex === -1) {
				return { findMatches, hiddenAreas, categories };
			}

			for (let i = fromLogLevelEntryIndex; i < logEntries.length; i++) {
				const entry = logEntries[i];
				if (entry.category) {
					categories.set(`${activeChannel.id}:${entry.category}`, entry.category);
				}
				if (hasLogLevelFilter && !this.shouldShowLogLevel(entry, filters)) {
					hiddenAreas.push(entry.range);
					continue;
				}
				if (!this.shouldShowCategory(activeChannel.id, entry, filters)) {
					hiddenAreas.push(entry.range);
					continue;
				}
				if (filters.includePatterns.length > 0 || filters.excludePatterns.length > 0) {
					const result = this.shouldShowLine(model, entry.range, filters.includePatterns, filters.excludePatterns);
					if (result.show) {
						findMatches.push(...result.matches);
					} else {
						hiddenAreas.push(entry.range);
					}
				}
			}
			return { findMatches, hiddenAreas, categories };
		}

		if (filters.includePatterns.length === 0 && filters.excludePatterns.length === 0) {
			return { findMatches, hiddenAreas, categories };
		}

		const lineCount = model.getLineCount();
		for (let lineNumber = fromLineNumber; lineNumber <= lineCount; lineNumber++) {
			const lineRange = new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber));
			const result = this.shouldShowLine(model, lineRange, filters.includePatterns, filters.excludePatterns);
			if (result.show) {
				findMatches.push(...result.matches);
			} else {
				hiddenAreas.push(lineRange);
			}
		}
		return { findMatches, hiddenAreas, categories };
	}

	private shouldShowLogLevel(entry: ILogEntry, filters: IOutputViewFilters): boolean {
		switch (entry.logLevel) {
			case LogLevel.Trace:
				return filters.trace;
			case LogLevel.Debug:
				return filters.debug;
			case LogLevel.Info:
				return filters.info;
			case LogLevel.Warning:
				return filters.warning;
			case LogLevel.Error:
				return filters.error;
		}
		return true;
	}

	private shouldShowCategory(activeChannelId: string, entry: ILogEntry, filters: IOutputViewFilters): boolean {
		if (!entry.category) {
			return true;
		}
		return !filters.hasCategory(`${activeChannelId}:${entry.category}`);
	}
}
