/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, append, EventType } from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { IEditorDecorationsCollection } from '../../../../editor/common/editorCommon.js';
import { IModelDeltaDecoration } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ContextMenuController } from '../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { ContentHoverController } from '../../../../editor/contrib/hover/browser/contentHoverController.js';
import { PlaceholderTextContribution } from '../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { getSimpleEditorOptions } from '../../codeEditor/browser/simpleEditorOptions.js';
import { IIssueReporterDescriptionDiagnostic, IIssueReporterDescriptionEditor, IIssueReporterDescriptionEditorOptions } from './issueReporterOverlay.js';

let descriptionEditorId = 0;

export class IssueReporterDescriptionEditor extends Disposable implements IIssueReporterDescriptionEditor {

	readonly element: HTMLElement;
	private readonly editor: CodeEditorWidget;
	private readonly model;
	private readonly decorations: IEditorDecorationsCollection;

	constructor(
		parent: HTMLElement,
		options: IIssueReporterDescriptionEditorOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		this.element = append(parent, document.createElement('div'));
		this.element.classList.add('issue-reporter-description-editor');
		this.element.setAttribute('aria-label', options.ariaLabel);

		this.editor = this._register(instantiationService.createInstance(
			CodeEditorWidget,
			this.element,
			{
				...getSimpleEditorOptions(configurationService),
				automaticLayout: true,
				ariaLabel: options.ariaLabel,
				wordWrap: 'on',
				lineNumbers: 'off',
				glyphMargin: false,
				folding: false,
				minimap: { enabled: false },
				padding: { top: 10, bottom: 10 },
				placeholder: options.placeholder,
				scrollBeyondLastLine: false,
			},
			{
				isSimpleWidget: true,
				contributions: EditorExtensionsRegistry.getSomeEditorContributions([
					ContextMenuController.ID,
					ContentHoverController.ID,
					PlaceholderTextContribution.ID,
				]),
			},
		));

		const resource = URI.from({ scheme: 'issue-reporter', path: `/description-${++descriptionEditorId}.md` });
		this.model = this._register(modelService.createModel(options.initialValue, { languageId: 'markdown', onDidChange: Event.None }, resource, true));
		this.editor.setModel(this.model);
		this.decorations = this.editor.createDecorationsCollection();
		this._register(toDisposable(() => this.decorations.clear()));

		this._register(this.editor.onDidChangeModelContent(() => options.onDidChange()));
		this._register(addDisposableListener(this.element, EventType.PASTE, (event: ClipboardEvent) => options.onDidPaste(event), true));
	}

	getValue(): string {
		return this.model.getValue();
	}

	setValue(value: string): void {
		if (value !== this.model.getValue()) {
			this.model.setValue(value);
		}
	}

	focus(): void {
		this.editor.focus();
	}

	setVisible(visible: boolean): void {
		this.element.classList.toggle('hidden', !visible);
		if (visible) {
			this.editor.layout();
		}
	}

	setInvalid(invalid: boolean): void {
		this.element.classList.toggle('invalid-input', invalid);
	}

	setDiagnostics(diagnostics: readonly IIssueReporterDescriptionDiagnostic[]): void {
		const decorations: IModelDeltaDecoration[] = diagnostics.map(diagnostic => ({
			range: this.rangeAt(diagnostic.start, diagnostic.end),
			options: {
				description: 'issue-quality-review',
				inlineClassName: diagnostic.severity === 'warning' ? 'issue-reporter-quality-squiggle-warning' : 'issue-reporter-quality-squiggle-info',
				hoverMessage: this.createHoverMessage(diagnostic),
				showIfCollapsed: true,
			},
		}));
		this.decorations.set(decorations);
	}

	applyEdit(start: number, end: number, replacement: string): void {
		const range = this.rangeAt(start, end);
		this.editor.executeEdits('issue-quality-review', [{ range, text: replacement, forceMoveMarkers: true }]);
		this.editor.setPosition(this.model.getPositionAt(start + replacement.length));
		this.editor.focus();
	}

	reveal(start: number, end: number): void {
		const range = this.rangeAt(start, end);
		this.editor.revealRangeInCenter(range);
		this.editor.setSelection(range);
		this.editor.focus();
	}

	private rangeAt(start: number, end: number) {
		const valueLength = this.model.getValueLength();
		const safeStart = Math.max(0, Math.min(start, valueLength));
		const safeEnd = Math.max(safeStart, Math.min(end, valueLength));
		const startPosition = this.model.getPositionAt(safeStart);
		const endPosition = this.model.getPositionAt(safeEnd === safeStart ? Math.min(safeStart + 1, valueLength) : safeEnd);
		return {
			startLineNumber: startPosition.lineNumber,
			startColumn: startPosition.column,
			endLineNumber: endPosition.lineNumber,
			endColumn: endPosition.column,
		};
	}

	private createHoverMessage(diagnostic: IIssueReporterDescriptionDiagnostic): MarkdownString {
		const message = new MarkdownString().appendText(diagnostic.message);
		if (diagnostic.replacement !== undefined) {
			message.appendMarkdown('\n\n**Suggested replacement:** ');
			message.appendText(diagnostic.replacement);
		}
		return message;
	}
}
