/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Color } from 'vs/base/common/color';
import { DisposableStore, IDisposable, IReference } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { count } from 'vs/base/common/strings';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { IPeekViewService, peekViewTitleBackground, peekViewTitleForeground, peekViewTitleInfoForeground, PeekViewWidget } from 'vs/editor/contrib/peekView/peekView';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorModel } from 'vs/workbench/common/editor';
import { testingPeekBorder } from 'vs/workbench/contrib/testing/browser/theme';
import { Testing } from 'vs/workbench/contrib/testing/common/constants';
import { InternalTestItem, ITestMessage } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { buildTestUri, TestUriType } from 'vs/workbench/contrib/testing/common/testingUri';

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

	/**
	 * Context key updated when the peek is visible/hidden.
	 */
	private readonly visible: IContextKey<boolean>;

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		this.visible = TestingContextKeys.peekVisible.bindTo(contextKeyService);
	}

	/**
	 * @inheritdoc
	 */
	public dispose(): void {
		this.removePeek();
	}

	/**
	 * Shows a peek for the message in th editor.
	 */
	public async show(test: InternalTestItem, messageIndex: number) {
		const message = test?.item.state.messages[messageIndex];
		if (!test || !message?.location) {
			return;
		}

		if (!this.peek) {
			this.peek = this.instantiationService.createInstance(TestingOutputPeek, this.editor);
		}

		this.visible.set(true);
		this.peek.setModel(test, messageIndex);
		this.peek.onDidClose(() => {
			this.visible.set(false);
			this.peek = undefined;
		});
	}

	/**
	 * Disposes the peek view, if any.
	 */
	public removePeek() {
		if (this.peek) {
			this.peek.dispose();
			this.peek = undefined;
		}
	}
}

export class TestingOutputPeek extends PeekViewWidget {
	private readonly disposable = new DisposableStore();
	private diff?: EmbeddedDiffEditorWidget;
	private model?: IDisposable;
	private dimension?: dom.Dimension;

	constructor(
		editor: ICodeEditor,
		@IThemeService themeService: IThemeService,
		@IPeekViewService peekViewService: IPeekViewService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly modelService: ITextModelService,
	) {
		super(editor, { showFrame: false, showArrow: true, isResizeable: true, isAccessible: true }, instantiationService);

		this._disposables.add(themeService.onDidColorThemeChange(this.applyTheme, this));
		this.applyTheme(themeService.getColorTheme());
		peekViewService.addExclusiveWidget(editor, this);
		this.create();
	}

	private applyTheme(theme: IColorTheme) {
		const borderColor = theme.getColor(testingPeekBorder) || Color.transparent;
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
		this.model?.dispose();
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

		if (this.dimension) {
			preview.layout(this.dimension);
		}
	}

	public async setModel(test: InternalTestItem, messageIndex: number) {
		const message = test.item.state.messages[messageIndex];
		if (!message?.location) {
			return;
		}

		this.show(message.location.range, hintPeekHeight(message));

		if (this.model) {
			this.model.dispose();
		}

		this.setTitle(message.message.toString(), test.item.label);
		if (message.actualOutput !== undefined && message.expectedOutput !== undefined) {
			await this.showDiffInEditor(test, messageIndex);
		} else {
			await this.showMessageInEditor(test, messageIndex);
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

	private async showMessageInEditor(test: InternalTestItem, messageIndex: number) {
		// todo? not sure if this is a useful experience
		this.model?.dispose();
		this.diff?.setModel(null);
	}

	private async showDiffInEditor(test: InternalTestItem, messageIndex: number) {
		const uriParts = { messageIndex, testId: test.id, providerId: test.providerId };
		const [original, modified] = await Promise.all([
			this.modelService.createModelReference(buildTestUri({ ...uriParts, type: TestUriType.ExpectedOutput })),
			this.modelService.createModelReference(buildTestUri({ ...uriParts, type: TestUriType.ActualOutput })),
		]);

		this.model?.dispose();
		const model = this.model = new SimpleDiffEditorModel(original, modified);
		if (!this.diff) {
			model.dispose();
		} else {
			this.diff.setModel(model);
		}
	}
}

const hintPeekHeight = (message: ITestMessage) => {
	const lines = Math.max(count(message.actualOutput || '', '\n'), count(message.expectedOutput || '', '\n'));
	return clamp(lines, 5, 20);
};

class SimpleDiffEditorModel extends EditorModel {
	public readonly original = this._original.object.textEditorModel;
	public readonly modified = this._modified.object.textEditorModel;

	constructor(
		private readonly _original: IReference<IResolvedTextEditorModel>,
		private readonly _modified: IReference<IResolvedTextEditorModel>,
	) {
		super();
	}

	async load(): Promise<this> {
		return this;
	}

	public dispose() {
		super.dispose();
		this._original.dispose();
		this._modified.dispose();
	}
}
