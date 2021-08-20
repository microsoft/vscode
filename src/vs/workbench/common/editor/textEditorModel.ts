/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel, ITextBufferFactory, ITextSnapshot, ModelConstants } from 'vs/editor/common/model';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { IModeSupport } from 'vs/workbench/services/textfile/common/textfiles';
import { URI } from 'vs/base/common/uri';
import { ITextEditorModel, IResolvedTextEditorModel } from 'vs/editor/common/services/resolverService';
import { IModeService, ILanguageSelection } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { MutableDisposable } from 'vs/base/common/lifecycle';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { withUndefinedAsNull } from 'vs/base/common/types';
import { ILanguageDetectionService } from 'vs/workbench/services/languageDetection/common/languageDetectionWorkerService';
import { ThrottledDelayer } from 'vs/base/common/async';

/**
 * The base text editor model leverages the code editor model. This class is only intended to be subclassed and not instantiated.
 */
export class BaseTextEditorModel extends EditorModel implements ITextEditorModel, IModeSupport {

	private static readonly AUTO_DETECT_LANGUAGE_THROTTLE_DELAY = 600;

	protected textEditorModelHandle: URI | undefined = undefined;

	private createdEditorModel: boolean | undefined;

	private readonly modelDisposeListener = this._register(new MutableDisposable());
	private readonly autoDetectLanguageThrottler = this._register(new ThrottledDelayer<void>(BaseTextEditorModel.AUTO_DETECT_LANGUAGE_THROTTLE_DELAY));

	constructor(
		@IModelService protected modelService: IModelService,
		@IModeService protected modeService: IModeService,
		@ILanguageDetectionService private readonly languageDetectionService: ILanguageDetectionService,
		textEditorModelHandle?: URI,
		preferredMode?: string
	) {
		super();

		if (textEditorModelHandle) {
			this.handleExistingModel(textEditorModelHandle);
		}

		if (preferredMode) {
			this.setModeInternal(preferredMode);
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

	isReadonly(): boolean {
		return true;
	}

	private _hasModeSetExplicitly: boolean = false;
	get hasModeSetExplicitly(): boolean { return this._hasModeSetExplicitly; }

	setMode(mode: string): void {
		// Remember that an explicit mode was set
		this._hasModeSetExplicitly = true;

		this.setModeInternal(mode);
	}

	private setModeInternal(mode: string): void {
		if (!this.isResolved()) {
			return;
		}

		if (!mode || mode === this.textEditorModel.getModeId()) {
			return;
		}

		this.modelService.setMode(this.textEditorModel, this.modeService.create(mode));
	}

	getMode(): string | undefined {
		return this.textEditorModel?.getModeId();
	}

	protected autoDetectLanguage(): Promise<void> {
		return this.autoDetectLanguageThrottler.trigger(() => this.doAutoDetectLanguage());
	}

	private async doAutoDetectLanguage(): Promise<void> {
		if (
			this.hasModeSetExplicitly || 															// skip detection when the user has made an explicit choice on the mode
			!this.textEditorModelHandle ||															// require a URI to run the detection for
			!this.languageDetectionService.isEnabledForMode(this.getMode() ?? PLAINTEXT_MODE_ID)	// require a valid mode that is enlisted for detection
		) {
			return;
		}

		const lang = await this.languageDetectionService.detectLanguage(this.textEditorModelHandle);
		if (lang && !this.isDisposed()) {
			this.setModeInternal(lang);
		}
	}

	/**
	 * Creates the text editor model with the provided value, optional preferred mode
	 * (can be comma separated for multiple values) and optional resource URL.
	 */
	protected createTextEditorModel(value: ITextBufferFactory, resource: URI | undefined, preferredMode?: string): ITextModel {
		const firstLineText = this.getFirstLineText(value);
		const languageSelection = this.getOrCreateMode(resource, this.modeService, preferredMode, firstLineText);

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
			this.updateTextEditorModel(value, languageSelection.languageIdentifier.language);
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
	 * Gets the mode for the given identifier. Subclasses can override to provide their own implementation of this lookup.
	 *
	 * @param firstLineText optional first line of the text buffer to set the mode on. This can be used to guess a mode from content.
	 */
	protected getOrCreateMode(resource: URI | undefined, modeService: IModeService, preferredMode: string | undefined, firstLineText?: string): ILanguageSelection {

		// lookup mode via resource path if the provided mode is unspecific
		if (!preferredMode || preferredMode === PLAINTEXT_MODE_ID) {
			return modeService.createByFilepathOrFirstLine(withUndefinedAsNull(resource), firstLineText);
		}

		// otherwise take the preferred mode for granted
		return modeService.create(preferredMode);
	}

	/**
	 * Updates the text editor model with the provided value. If the value is the same as the model has, this is a no-op.
	 */
	updateTextEditorModel(newValue?: ITextBufferFactory, preferredMode?: string): void {
		if (!this.isResolved()) {
			return;
		}

		// contents
		if (newValue) {
			this.modelService.updateModel(this.textEditorModel, newValue);
		}

		// mode (only if specific and changed)
		if (preferredMode && preferredMode !== PLAINTEXT_MODE_ID && this.textEditorModel.getModeId() !== preferredMode) {
			this.modelService.setMode(this.textEditorModel, this.modeService.create(preferredMode));
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
