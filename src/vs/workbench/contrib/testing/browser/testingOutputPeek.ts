/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Color } from 'vs/base/common/color';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IPeekViewService, peekViewBorder, peekViewTitleBackground, peekViewTitleForeground, peekViewTitleInfoForeground, PeekViewWidget } from 'vs/editor/contrib/peekView/peekView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { EditorModel } from 'vs/workbench/common/editor';
import { Testing } from 'vs/workbench/contrib/testing/common/constants';
import { ITestMessage } from 'vs/workbench/contrib/testing/common/testCollection';

export class TestingOutputPeekController implements IEditorContribution {
	/**
	 * Gets the controller associated with the given code editor.
	 */
	public static get(editor: ICodeEditor): TestingOutputPeekController {
		return editor.getContribution<TestingOutputPeekController>(Testing.OutputPeekContributionId);
	}

	/**
	 * Currently-shown peek view.
	 */
	private peek?: TestingOutputPeek;

	constructor(private readonly editor: ICodeEditor, @IInstantiationService private readonly instantiationService: IInstantiationService) { }

	public dispose(): void {
		// no-op
	}

	/**
	 * Shows a peek for the message in th editor.
	 */
	public show(output: ITestMessage) {
		this.removePeek();
		if (!output.location) {
			return;
		}

		this.peek = this.instantiationService.createInstance(TestingOutputPeek, this.editor, output);
		this.peek.show(output.location.range, 18);
	}

	private removePeek() {
		if (this.peek) {
			this.peek.dispose();
			this.peek = undefined;
		}
	}
}

export class TestingOutputPeek extends PeekViewWidget {
	private readonly disposable = new DisposableStore();
	private diff?: EmbeddedDiffEditorWidget;
	private dimension?: dom.Dimension;

	constructor(
		editor: ICodeEditor,
		private readonly message: ITestMessage,
		@IThemeService themeService: IThemeService,
		@IPeekViewService peekViewService: IPeekViewService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IUndoRedoService private readonly undoRedo: IUndoRedoService,
	) {
		super(editor, { showFrame: false, showArrow: true, isResizeable: true, isAccessible: true }, instantiationService);

		this._disposables.add(themeService.onDidColorThemeChange(this.applyTheme, this));
		this.applyTheme(themeService.getColorTheme());

		peekViewService.addExclusiveWidget(editor, this);

		this.create();
		this.setTitle(message.message.toString());
	}

	private applyTheme(theme: IColorTheme) {
		const borderColor = theme.getColor(peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
			headerBackgroundColor: theme.getColor(peekViewTitleBackground) || Color.transparent,
			primaryHeadingColor: theme.getColor(peekViewTitleForeground),
			secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
		});
	}

	/**
	 * @override
	 */
	public dispose() {
		super.dispose();
		this.disposable.dispose();
	}

	/**
	 * @override
	 */
	protected _fillBody(containerElement: HTMLElement): void {
		const diffContainer = dom.append(containerElement, dom.$('div.preview.inline'));
		let options: IDiffEditorOptions = {
			scrollBeyondLastLine: false,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false,
				alwaysConsumeMouseWheel: false
			},
			overviewRulerLanes: 2,
			fixedOverflowWidgets: true,
			readOnly: true,
			minimap: {
				enabled: false
			},
			enableSplitViewResizing: true,
			isInEmbeddedEditor: true,
			renderOverviewRuler: false,
			ignoreTrimWhitespace: false,
			renderSideBySide: true,
		};

		const preview = this.diff = this.instantiationService.createInstance(EmbeddedDiffEditorWidget, diffContainer, options, this.editor);
		this.disposable.add(preview);

		// todo: we probably want to have uri schemes for these guys since this
		// does not work very well right now
		preview.setModel(new SimpleDiffEditorModel(
			new TextModel(this.message.expectedOutput!, TextModel.DEFAULT_CREATION_OPTIONS, null, null, this.undoRedo),
			new TextModel(this.message.actualOutput!, TextModel.DEFAULT_CREATION_OPTIONS, null, null, this.undoRedo)
		));

		if (this.dimension) {
			preview.layout(this.dimension);
		}
	}

	/**
	 * @override
	 */
	protected _doLayoutBody(height: number, width: number) {
		super._doLayoutBody(height, width);
		this.dimension = new dom.Dimension(width, height);
		this.diff?.layout(this.dimension);
	}
}

class SimpleDiffEditorModel extends EditorModel {
	constructor(
		readonly original: TextModel,
		readonly modified: TextModel,
	) {
		super();
	}

	async load(): Promise<this> {
		return this;
	}
}
