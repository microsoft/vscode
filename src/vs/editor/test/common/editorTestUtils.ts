/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { DefaultEndOfLine, ITextModelCreationOptions } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { LanguageIdentifier } from 'vs/editor/common/modes';

export function withEditorModel(text: string[], callback: (model: TextModel) => void): void {
	let model = TextModel.createFromString(text.join('\n'));
	callback(model);
	model.dispose();
}

export interface IRelaxedTextModelCreationOptions {
	tabSize?: number;
	insertSpaces?: boolean;
	detectIndentation?: boolean;
	trimAutoWhitespace?: boolean;
	defaultEOL?: DefaultEndOfLine;
	isForSimpleWidget?: boolean;
	largeFileOptimizations?: boolean;
}

export function createTextModel(text: string, _options: IRelaxedTextModelCreationOptions = TextModel.DEFAULT_CREATION_OPTIONS, languageIdentifier: LanguageIdentifier | null = null, uri: URI | null = null): TextModel {
	const options: ITextModelCreationOptions = {
		tabSize: (typeof _options.tabSize === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.tabSize : _options.tabSize),
		insertSpaces: (typeof _options.insertSpaces === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.insertSpaces : _options.insertSpaces),
		detectIndentation: (typeof _options.detectIndentation === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.detectIndentation : _options.detectIndentation),
		trimAutoWhitespace: (typeof _options.trimAutoWhitespace === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.trimAutoWhitespace : _options.trimAutoWhitespace),
		defaultEOL: (typeof _options.defaultEOL === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.defaultEOL : _options.defaultEOL),
		isForSimpleWidget: (typeof _options.isForSimpleWidget === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.isForSimpleWidget : _options.isForSimpleWidget),
		largeFileOptimizations: (typeof _options.largeFileOptimizations === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.largeFileOptimizations : _options.largeFileOptimizations),
	};
	return TextModel.createFromString(text, options, languageIdentifier, uri);
}
