/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Color, RGBA } from 'vs/base/common/color';
import { ITextModel } from 'vs/editor/common/model';
import { DocumentColorProvider, IColor, IColorInformation, IColorPresentation } from 'vs/editor/common/languages';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { registerEditorFeature } from 'vs/editor/common/editorFeatures';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';

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
		const alpha = colorFromInfo.alpha;
		const color = new Color(new RGBA(Math.round(255 * colorFromInfo.red), Math.round(255 * colorFromInfo.green), Math.round(255 * colorFromInfo.blue), alpha));

		const rgb = alpha ? Color.Format.CSS.formatRGB(color) : Color.Format.CSS.formatRGBA(color);
		const hsl = alpha ? Color.Format.CSS.formatHSL(color) : Color.Format.CSS.formatHSLA(color);
		const hex = alpha ? Color.Format.CSS.formatHex(color) : Color.Format.CSS.formatHexA(color);

		const colorPresentations: IColorPresentation[] = [];
		colorPresentations.push({ label: rgb, textEdit: { range: range, text: rgb } });
		colorPresentations.push({ label: hsl, textEdit: { range: range, text: hsl } });
		colorPresentations.push({ label: hex, textEdit: { range: range, text: hex } });
		return colorPresentations;
	}
}

class DefaultDocumentColorProviderFeature extends Disposable {
	constructor(
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
	) {
		super();
		this._register(_languageFeaturesService.colorProvider.register('*', new DefaultDocumentColorProvider(editorWorkerService)));
	}
}

registerEditorFeature(DefaultDocumentColorProviderFeature);
