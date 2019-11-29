/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./notebook';
import * as DOM from 'vs/base/browser/dom';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { EditorOptions } from 'vs/workbench/common/editor';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import * as marked from 'vs/base/common/marked/marked';
import { IModelService } from 'vs/editor/common/services/modelService';
import { URI } from 'vs/base/common/uri';
import { IModeService } from 'vs/editor/common/services/modeService';
import { deepClone } from 'vs/base/common/objects';
import { IEditorOptions, EditorOption } from 'vs/editor/common/config/editorOptions';
import { isObject } from 'vs/base/common/types';
import { getExtraColor } from 'vs/workbench/contrib/welcome/walkThrough/common/walkThroughUtils';
import { textLinkForeground, textLinkActiveForeground, focusBorder, textPreformatForeground, contrastBorder, textBlockQuoteBackground, textBlockQuoteBorder } from 'vs/platform/theme/common/colorRegistry';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';

const $ = DOM.$;

interface Cell {
	type: 'markdown' | 'code';
	value: string;
}

export class NotebookEditor extends BaseEditor {
	static readonly ID: string = 'workbench.editor.notebook';
	private rootElement!: HTMLElement;
	private body!: HTMLElement;
	private scrollbar!: DomScrollableElement;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private modeService: IModeService
	) {
		super(NotebookEditor.ID, telemetryService, themeService, storageService);
	}
	get minimumWidth(): number { return 375; }
	get maximumWidth(): number { return Number.POSITIVE_INFINITY; }

	// these setters need to exist because this extends from BaseEditor
	set minimumWidth(value: number) { /*noop*/ }
	set maximumWidth(value: number) { /*noop*/ }


	protected createEditor(parent: HTMLElement): void {
		this.rootElement = DOM.append(parent, $('.notebook-editor'));
		this.createBody(this.rootElement);
	}

	private createBody(parent: HTMLElement): void {
		this.body = document.createElement('div'); //DOM.append(parent, $('.notebook-body'));
		this.scrollbar = new DomScrollableElement(this.body, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Auto
		});
		DOM.append(parent, this.scrollbar.getDomNode());
	}

	setInput(input: NotebookEditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		const codeConfig = this.getEditorOptions('javascript');

		const renderer = new marked.Renderer();

		return super.setInput(input, options, token).then(() => {
			// 1292 markdown
			// 545
			let cells: Cell[] = [
				{
					type: 'markdown',
					value: [
						'There are two other keyboard shortcuts for running code:\n',
						'\n',
						'* `Alt-Enter` runs the current cell and inserts a new one below.\n',
						'* `Ctrl-Enter` run the current cell and enters command mode.'
					].join('')
				},
				{
					type: 'markdown',
					value: [
						'There are two other keyboard shortcuts for running code:\n',
						'\n',
						'* `Alt-Enter` runs the current cell and inserts a new one below.\n',
						'* `Ctrl-Enter` run the current cell and enters command mode.'
					].join('')
				},
				{
					type: 'code',
					value: [
						'import sys\n',
						'from ctypes import CDLL\n',
						'# This will crash a Linux or Mac system\n',
						'# equivalent calls can be made on Windows\n',
						'\n',
						'# Uncomment these lines if you would like to see the segfault\n',
						'\n',
						'# libc = CDLL(\"libc.%s\" % dll) \n',
						'# libc.time(-1)  # BOOM!'
					].join('')
				}
			];

			let stressCells = [];
			for (let i = 0; i < 500; i++) {
				stressCells.push(...cells);
			}

			let i = 0;
			const cellsContainer = document.createElement('div');
			const updates: ((initial: boolean) => void)[] = [];

			stressCells.forEach(cell => {
				if (cell.type === 'markdown') {
					const innerContent = document.createElement('div');
					DOM.addClasses(innerContent, 'cell', 'markdown');
					innerContent.innerHTML = marked(cell.value, { renderer });
					cellsContainer.append(innerContent);
				} else {
					const innerContent = document.createElement('div');
					DOM.addClasses(innerContent, 'cell', 'code');
					const editor = this.instantiationService.createInstance(CodeEditorWidget, innerContent, codeConfig, {});
					const resource = URI.parse(`notebookcell-${i}-${Date.now()}.js`);
					const model = this.modelService.createModel(cell.value, this.modeService.createByFilepathOrFirstLine(resource), resource, false);
					editor.setModel(model);
					const updateHeight = (initial: boolean) => {
						const lineHeight = editor.getOption(EditorOption.lineHeight);
						const height = `${Math.max(model.getLineCount() + 1, 4) * lineHeight}px`;
						if (innerContent.style.height !== height) {
							innerContent.style.height = height;

							editor.layout({
								width: innerContent.clientWidth,
								height: Math.max(model.getLineCount() + 1, 4) * lineHeight
							});

							if (!initial) {
								this.scrollbar.scanDomNode();
							}
						}
					};
					cellsContainer.append(innerContent);
					updates.push(updateHeight);
				}
			});

			this.body.append(cellsContainer);
			for (let i = 0; i < updates.length; i++) {
				updates[i](true);
			}

			this.scrollbar.scanDomNode();
		});
	}

	private getEditorOptions(language: string): IEditorOptions {
		const config = deepClone(this.configurationService.getValue<IEditorOptions>('editor', { overrideIdentifier: language }));
		return {
			...isObject(config) ? config : Object.create(null),
			scrollBeyondLastLine: false,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false
			},
			overviewRulerLanes: 3,
			fixedOverflowWidgets: true,
			lineNumbersMinChars: 1,
			minimap: { enabled: false },
		};
	}

	layout(dimension: DOM.Dimension): void {
		DOM.toggleClass(this.rootElement, 'mid-width', dimension.width < 1000 && dimension.width >= 600);
		DOM.toggleClass(this.rootElement, 'narrow-width', dimension.width < 600);
		DOM.size(this.body, dimension.width, dimension.height);

	}
}

const embeddedEditorBackground = 'walkThrough.embeddedEditorBackground';

registerThemingParticipant((theme, collector) => {
	const color = getExtraColor(theme, embeddedEditorBackground, { dark: 'rgba(0, 0, 0, .4)', extra_dark: 'rgba(200, 235, 255, .064)', light: '#f4f4f4', hc: null });
	if (color) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .monaco-editor-background,
			.monaco-workbench .part.editor > .content .notebook-editor .margin-view-overlays { background: ${color}; }`);
	}
	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor a { color: ${link}; }`);
	}
	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor a:hover,
			.monaco-workbench .part.editor > .content .notebook-editor a:active { color: ${activeLink}; }`);
	}
	const focusColor = theme.getColor(focusBorder);
	if (focusColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor a:focus { outline-color: ${focusColor}; }`);
	}
	const shortcut = theme.getColor(textPreformatForeground);
	if (shortcut) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor code,
			.monaco-workbench .part.editor > .content .notebook-editor .shortcut { color: ${shortcut}; }`);
	}
	const border = theme.getColor(contrastBorder);
	if (border) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .monaco-editor { border-color: ${border}; }`);
	}
	const quoteBackground = theme.getColor(textBlockQuoteBackground);
	if (quoteBackground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor blockquote { background: ${quoteBackground}; }`);
	}
	const quoteBorder = theme.getColor(textBlockQuoteBorder);
	if (quoteBorder) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor blockquote { border-color: ${quoteBorder}; }`);
	}
});
