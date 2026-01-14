/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Color, RGBA } from '../../../../base/common/color.js';
import { ITextModel } from '../../../common/model.js';
import { DocumentColorProvider, IColor, IColorInformation, IColorPresentation } from '../../../common/languages.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { IEditorWorkerService } from '../../../common/services/editorWorker.js';

export class DefaultDocumentColorProvider implements DocumentColorProvider {

	constructor(
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
	) { }

	async provideDocumentColors(model: ITextModel, _token: CancellationToken): Promise<IColorInformation[] | null> {
		return this._editorWorkerService.computeDefaultDocumentColors(model.uri);
	}

	provideColorPresentations(_model: ITextModel, colorInfo: IColorInformation, _token: CancellationToken): IColorPresentation[] {
		const range = colorInfo.range;
		const colorFromInfo: IColor = colorInfo.color;
		const color = new Color(new RGBA(Math.round(255 * colorFromInfo.red), Math.round(255 * colorFromInfo.green), Math.round(255 * colorFromInfo.blue), colorFromInfo.alpha));

		const rgb = Color.Format.CSS.formatRGB(color);
		const hsl = Color.Format.CSS.formatHSL(color);
		const hex = Color.Format.CSS.formatHexA(color, true);

		const colorPresentations: IColorPresentation[] = [];
		colorPresentations.push({ label: rgb, textEdit: { range: range, text: rgb } });
		colorPresentations.push({ label: hsl, textEdit: { range: range, text: hsl } });
		colorPresentations.push({ label: hex, textEdit: { range: range, text: hex } });
		return colorPresentations;
	}
}

export class DefaultDocumentColorProviderFeature extends Disposable {
	constructor(
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
	) {
		super();
		this._register(_languageFeaturesService.colorProvider.register('*', new DefaultDocumentColorProvider(editorWorkerService)));
	}
}

