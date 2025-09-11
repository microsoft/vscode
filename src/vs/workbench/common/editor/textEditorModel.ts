/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel, ITextBufferFactory, ITextSnapshot, ModelConstants } from '../../../editor/common/model.js';
import { EditorModel } from './editorModel.js';
import { ILanguageSupport } from '../../services/textfile/common/textfiles.js';
import { URI } from '../../../base/common/uri.js';
import { ITextEditorModel, IResolvedTextEditorModel } from '../../../editor/common/services/resolverService.js';
import { ILanguageService, ILanguageSelection } from '../../../editor/common/languages/language.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { MutableDisposable } from '../../../base/common/lifecycle.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../editor/common/languages/modesRegistry.js';
import { ILanguageDetectionService, LanguageDetectionLanguageEventSource } from '../../services/languageDetection/common/languageDetectionWorkerService.js';
import { ThrottledDelayer } from '../../../base/common/async.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { localize } from '../../../nls.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { TextModelEditSource } from '../../../editor/common/textModelEditSource.js';

/**
 * The base text editor model leverages the code editor model. This class is only intended to be subclassed and not instantiated.
 */
export class BaseTextEditorModel extends EditorModel implements ITextEditorModel, ILanguageSupport {

	private static readonly AUTO_DETECT_LANGUAGE_THROTTLE_DELAY = 600;

	protected textEditorModelHandle: URI | undefined = undefined;

	private createdEditorModel: boolean | undefined;

	private readonly modelDisposeListener = this._register(new MutableDisposable());
	private readonly autoDetectLanguageThrottler = this._register(new ThrottledDelayer<void>(BaseTextEditorModel.AUTO_DETECT_LANGUAGE_THROTTLE_DELAY));

	constructor(
		@IModelService protected modelService: IModelService,
		@ILanguageService protected languageService: ILanguageService,
		@ILanguageDetectionService private readonly languageDetectionService: ILanguageDetectionService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		textEditorModelHandle?: URI
	) {
		super();

		if (textEditorModelHandle) {
			this.handleExistingModel(textEditorModelHandle);
		}
	}

	private handleExistingModel(textEditorModelHandle: URI): void {

		// We need the resource to point to an existing model
		const model = this.modelService.getModel(textEditorModelHandle);
		if (!model) {
			throw new Error(`Document with resource ${textEditorModelHandle.toString(true)} does not exist`);
		}

		this.textEditorModelHandle = textEditorModelHandle;

		// Make sure we clean up when this model gets disposed
		this.registerModelDisposeListener(model);
	}

	private registerModelDisposeListener(model: ITextModel): void {
		this.modelDisposeListener.value = model.onWillDispose(() => {
			this.textEditorModelHandle = undefined; // make sure we do not dispose code editor model again
			this.dispose();
		});
	}

	get textEditorModel(): ITextModel | null {
		return this.textEditorModelHandle ? this.modelService.getModel(this.textEditorModelHandle) : null;
	}

	isReadonly(): boolean | IMarkdownString {
		return true;
	}

	private _blockLanguageChangeListener = false;
	private _languageChangeSource: 'user' | 'api' | undefined = undefined;
	get languageChangeSource() { return this._languageChangeSource; }
	get hasLanguageSetExplicitly() {
		// This is technically not 100% correct, because 'api' can also be
		// set as source if a model is resolved as text first and then
		// transitions into the resolved language. But to preserve the current
		// behaviour, we do not change this property. Rather, `languageChangeSource`
		// can be used to get more fine grained information.
		return typeof this._languageChangeSource === 'string';
	}

	setLanguageId(languageId: string, source?: string): void {

		// Remember that an explicit language was set
		this._languageChangeSource = 'user';

		this.setLanguageIdInternal(languageId, source);
	}

	private setLanguageIdInternal(languageId: string, source?: string): void {
		if (!this.isResolved()) {
			return;
		}

		if (!languageId || languageId === this.textEditorModel.getLanguageId()) {
			return;
		}

		this._blockLanguageChangeListener = true;
		try {
			this.textEditorModel.setLanguage(this.languageService.createById(languageId), source);
		} finally {
			this._blockLanguageChangeListener = false;
		}
	}

	protected installModelListeners(model: ITextModel): void {

		// Setup listener for lower level language changes
		const disposable = this._register(model.onDidChangeLanguage(e => {
			if (
				e.source === LanguageDetectionLanguageEventSource ||
				this._blockLanguageChangeListener
			) {
				return;
			}

			this._languageChangeSource = 'api';
			disposable.dispose();
		}));
	}

	getLanguageId(): string | undefined {
		return this.textEditorModel?.getLanguageId();
	}

	protected autoDetectLanguage(): Promise<void> {
		return this.autoDetectLanguageThrottler.trigger(() => this.doAutoDetectLanguage());
	}

	private async doAutoDetectLanguage(): Promise<void> {
		if (
			this.hasLanguageSetExplicitly || 																	// skip detection when the user has made an explicit choice on the language
			!this.textEditorModelHandle ||																		// require a URI to run the detection for
			!this.languageDetectionService.isEnabledForLanguage(this.getLanguageId() ?? PLAINTEXT_LANGUAGE_ID)	// require a valid language that is enlisted for detection
		) {
			return;
		}

		const lang = await this.languageDetectionService.detectLanguage(this.textEditorModelHandle);
		const prevLang = this.getLanguageId();
		if (lang && lang !== prevLang && !this.isDisposed()) {
			this.setLanguageIdInternal(lang, LanguageDetectionLanguageEventSource);
			const languageName = this.languageService.getLanguageName(lang);
			this.accessibilityService.alert(localize('languageAutoDetected', "Language {0} was automatically detected and set as the language mode.", languageName ?? lang));
		}
	}

	/**
	 * Creates the text editor model with the provided value, optional preferred language
	 * (can be comma separated for multiple values) and optional resource URL.
	 */
	protected createTextEditorModel(value: ITextBufferFactory, resource: URI | undefined, preferredLanguageId?: string): ITextModel {
		const firstLineText = this.getFirstLineText(value);
		const languageSelection = this.getOrCreateLanguage(resource, this.languageService, preferredLanguageId, firstLineText);

		return this.doCreateTextEditorModel(value, languageSelection, resource);
	}

	private doCreateTextEditorModel(value: ITextBufferFactory, languageSelection: ILanguageSelection, resource: URI | undefined): ITextModel {
		let model = resource && this.modelService.getModel(resource);
		if (!model) {
			model = this.modelService.createModel(value, languageSelection, resource);
			this.createdEditorModel = true;

			// Make sure we clean up when this model gets disposed
			this.registerModelDisposeListener(model);
		} else {
			this.updateTextEditorModel(value, languageSelection.languageId);
		}

		this.textEditorModelHandle = model.uri;

		return model;
	}

	protected getFirstLineText(value: ITextBufferFactory | ITextModel): string {

		// text buffer factory
		const textBufferFactory = value as ITextBufferFactory;
		if (typeof textBufferFactory.getFirstLineText === 'function') {
			return textBufferFactory.getFirstLineText(ModelConstants.FIRST_LINE_DETECTION_LENGTH_LIMIT);
		}

		// text model
		const textSnapshot = value as ITextModel;
		return textSnapshot.getLineContent(1).substr(0, ModelConstants.FIRST_LINE_DETECTION_LENGTH_LIMIT);
	}

	/**
	 * Gets the language for the given identifier. Subclasses can override to provide their own implementation of this lookup.
	 *
	 * @param firstLineText optional first line of the text buffer to set the language on. This can be used to guess a language from content.
	 */
	protected getOrCreateLanguage(resource: URI | undefined, languageService: ILanguageService, preferredLanguage: string | undefined, firstLineText?: string): ILanguageSelection {

		// lookup language via resource path if the provided language is unspecific
		if (!preferredLanguage || preferredLanguage === PLAINTEXT_LANGUAGE_ID) {
			return languageService.createByFilepathOrFirstLine(resource ?? null, firstLineText);
		}

		// otherwise take the preferred language for granted
		return languageService.createById(preferredLanguage);
	}

	/**
	 * Updates the text editor model with the provided value. If the value is the same as the model has, this is a no-op.
	 */
	updateTextEditorModel(newValue?: ITextBufferFactory, preferredLanguageId?: string, reason?: TextModelEditSource): void {
		if (!this.isResolved()) {
			return;
		}

		// contents
		if (newValue) {
			this.modelService.updateModel(this.textEditorModel, newValue, reason);
		}

		// language (only if specific and changed)
		if (preferredLanguageId && preferredLanguageId !== PLAINTEXT_LANGUAGE_ID && this.textEditorModel.getLanguageId() !== preferredLanguageId) {
			this.textEditorModel.setLanguage(this.languageService.createById(preferredLanguageId));
		}
	}

	createSnapshot(this: IResolvedTextEditorModel): ITextSnapshot;
	createSnapshot(this: ITextEditorModel): ITextSnapshot | null;
	createSnapshot(): ITextSnapshot | null {
		if (!this.textEditorModel) {
			return null;
		}

		return this.textEditorModel.createSnapshot(true /* preserve BOM */);
	}

	override isResolved(): this is IResolvedTextEditorModel {
		return !!this.textEditorModelHandle;
	}

	override dispose(): void {
		this.modelDisposeListener.dispose(); // dispose this first because it will trigger another dispose() otherwise

		if (this.textEditorModelHandle && this.createdEditorModel) {
			this.modelService.destroyModel(this.textEditorModelHandle);
		}

		this.textEditorModelHandle = undefined;
		this.createdEditorModel = false;

		super.dispose();
	}
}
