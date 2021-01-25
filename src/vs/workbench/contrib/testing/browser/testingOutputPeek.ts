/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Color } from 'vs/base/common/color';
import { IReference, MutableDisposable } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { count } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EmbeddedCodeEditorWidget, EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IDiffEditorOptions, IEditorOptions } from 'vs/editor/common/config/editorOptions';
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
import { buildTestUri, parseTestUri, TestUriType } from 'vs/workbench/contrib/testing/common/testingUri';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';

interface ITestDto {
	messageIndex: number;
	test: InternalTestItem;
	expectedUri: URI;
	actualUri: URI;
	messageUri: URI;
}

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
	private readonly peek = new MutableDisposable<TestingOutputPeek>();

	/**
	 * Context key updated when the peek is visible/hidden.
	 */
	private readonly visible: IContextKey<boolean>;

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITestResultService private readonly testResults: ITestResultService,
		@ITestService private readonly testService: ITestService,
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
	public async show(uri: URI) {
		const dto = await this.retrieveTest(uri);
		if (!dto) {
			return;
		}

		const message = dto.test.item.state.messages[dto.messageIndex];
		if (!message?.location) {
			return;
		}

		const ctor = message.actualOutput !== undefined && message.expectedOutput !== undefined
			? TestingDiffOutputPeek : TestingMessageOutputPeek;
		const isNew = !(this.peek.value instanceof ctor);
		if (isNew) {
			this.peek.value = this.instantiationService.createInstance(ctor, this.editor);
			this.peek.value.onDidClose(() => {
				this.visible.set(false);
				this.peek.value = undefined;
			});
		}

		if (isNew) {
			this.visible.set(true);
			this.peek.value!.create();
		}

		this.peek.value!.setModel(dto);
	}

	/**
	 * Disposes the peek view, if any.
	 */
	public removePeek() {
		this.peek.value = undefined;
	}

	private async retrieveTest(uri: URI): Promise<ITestDto | undefined> {
		const parts = parseTestUri(uri);
		if (!parts) {
			return undefined;
		}

		if ('resultId' in parts) {
			const test = this.testResults.lookup(parts.resultId)?.tests.find(t => t.id === parts.testId);
			return test && {
				test,
				messageIndex: parts.messageIndex,
				expectedUri: buildTestUri({ ...parts, type: TestUriType.ResultExpectedOutput }),
				actualUri: buildTestUri({ ...parts, type: TestUriType.ResultActualOutput }),
				messageUri: buildTestUri({ ...parts, type: TestUriType.ResultMessage }),
			};
		}

		const test = await this.testService.lookupTest({ providerId: parts.providerId, testId: parts.testId });
		if (!test) {
			return;
		}

		return {
			test,
			messageIndex: parts.messageIndex,
			expectedUri: buildTestUri({ ...parts, type: TestUriType.LiveActualOutput }),
			actualUri: buildTestUri({ ...parts, type: TestUriType.LiveExpectedOutput }),
			messageUri: buildTestUri({ ...parts, type: TestUriType.LiveMessage }),
		};
	}
}

abstract class TestingOutputPeek extends PeekViewWidget {
	protected model = new MutableDisposable();
	protected dimension?: dom.Dimension;

	constructor(
		editor: ICodeEditor,
		@IThemeService themeService: IThemeService,
		@IPeekViewService peekViewService: IPeekViewService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@ITextModelService protected readonly modelService: ITextModelService,
	) {
		super(editor, { showFrame: false, showArrow: true, isResizeable: true, isAccessible: true, className: 'test-output-peek' }, instantiationService);

		this._disposables.add(themeService.onDidColorThemeChange(this.applyTheme, this));
		this._disposables.add(this.model);
		this.applyTheme(themeService.getColorTheme());
		peekViewService.addExclusiveWidget(editor, this);
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
	 * Updates the test to be shown.
	 */
	public abstract setModel(dto: ITestDto): Promise<void>;

	/**
	 * @override
	 */
	protected _doLayoutBody(height: number, width: number) {
		super._doLayoutBody(height, width);
		this.dimension = new dom.Dimension(width, height);
	}
}

const commonEditorOptions: IEditorOptions = {
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
};

const diffEditorOptions: IDiffEditorOptions = {
	...commonEditorOptions,
	enableSplitViewResizing: true,
	isInEmbeddedEditor: true,
	renderOverviewRuler: false,
	ignoreTrimWhitespace: false,
	renderSideBySide: true,
};

class TestingDiffOutputPeek extends TestingOutputPeek {
	private readonly diff = this._disposables.add(new MutableDisposable<EmbeddedDiffEditorWidget>());

	/**
	 * @override
	 */
	protected _fillBody(containerElement: HTMLElement): void {
		const diffContainer = dom.append(containerElement, dom.$('div.preview.inline'));
		const preview = this.diff.value = this.instantiationService.createInstance(EmbeddedDiffEditorWidget, diffContainer, diffEditorOptions, this.editor);

		if (this.dimension) {
			preview.layout(this.dimension);
		}
	}

	/**
	 * @override
	 */
	public async setModel({ test, messageIndex, expectedUri, actualUri }: ITestDto) {
		const message = test.item.state.messages[messageIndex];
		if (!message?.location) {
			return;
		}

		this.show(message.location.range, hintDiffPeekHeight(message));
		this.setTitle(message.message.toString(), test.item.label);

		const [original, modified] = await Promise.all([
			this.modelService.createModelReference(expectedUri),
			this.modelService.createModelReference(actualUri),
		]);

		const model = this.model.value = new SimpleDiffEditorModel(original, modified);
		if (!this.diff.value) {
			this.model.value = undefined;
		} else {
			this.diff.value.setModel(model);
		}
	}

	/**
	 * @override
	 */
	protected _doLayoutBody(height: number, width: number) {
		super._doLayoutBody(height, width);
		this.diff.value?.layout(this.dimension);
	}
}

class TestingMessageOutputPeek extends TestingOutputPeek {
	private readonly preview = this._disposables.add(new MutableDisposable<EmbeddedCodeEditorWidget>());

	/**
	 * @override
	 */
	protected _fillBody(containerElement: HTMLElement): void {
		const diffContainer = dom.append(containerElement, dom.$('div.preview.inline'));
		const preview = this.preview.value = this.instantiationService.createInstance(EmbeddedCodeEditorWidget, diffContainer, commonEditorOptions, this.editor);

		if (this.dimension) {
			preview.layout(this.dimension);
		}
	}

	/**
	 * @override
	 */
	public async setModel({ test, messageIndex, messageUri }: ITestDto) {
		const message = test.item.state.messages[messageIndex];
		if (!message?.location) {
			return;
		}

		this.show(message.location.range, hintPeekStrHeight(message.message.toString()));
		this.setTitle(message.message.toString(), test.item.label);

		const modelRef = this.model.value = await this.modelService.createModelReference(messageUri);
		if (this.preview.value) {
			this.preview.value.setModel(modelRef.object.textEditorModel);
		} else {
			this.model.value = undefined;
		}
	}

	/**
	 * @override
	 */
	protected _doLayoutBody(height: number, width: number) {
		super._doLayoutBody(height, width);
		this.preview.value?.layout(this.dimension);
	}
}

const hintDiffPeekHeight = (message: ITestMessage) =>
	Math.max(hintPeekStrHeight(message.actualOutput), hintPeekStrHeight(message.expectedOutput));

const hintPeekStrHeight = (str: string | undefined) => clamp(count(str || '', '\n'), 5, 20);

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
