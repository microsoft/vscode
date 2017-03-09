/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Model } from 'vs/editor/common/model/model';
import { CharacterHardWrappingLineMapperFactory } from 'vs/editor/common/viewModel/characterHardWrappingLineMapper';
import { TestConfiguration } from 'vs/editor/test/common/mocks/testConfiguration';
import { SplitLinesCollection } from 'vs/editor/common/viewModel/splitLinesCollection';
import { ViewModel } from 'vs/editor/common/viewModel/viewModelImpl';
import * as editorCommon from 'vs/editor/common/editorCommon';

export function testViewModel(text: string[], options: editorCommon.ICodeEditorWidgetCreationOptions, callback: (viewModel: ViewModel, model: Model) => void): void {
	const EDITOR_ID = 1;

	let configuration = new TestConfiguration(options);

	let model = Model.createFromString(text.join('\n'));

	let factory = new CharacterHardWrappingLineMapperFactory(
		configuration.editor.wrappingInfo.wordWrapBreakBeforeCharacters,
		configuration.editor.wrappingInfo.wordWrapBreakAfterCharacters,
		configuration.editor.wrappingInfo.wordWrapBreakObtrusiveCharacters
	);

	let linesCollection = new SplitLinesCollection(
		model,
		factory,
		model.getOptions().tabSize,
		configuration.editor.wrappingInfo.wrappingColumn,
		configuration.editor.fontInfo.typicalFullwidthCharacterWidth / configuration.editor.fontInfo.typicalHalfwidthCharacterWidth,
		configuration.editor.wrappingInfo.wrappingIndent
	);

	let viewModel = new ViewModel(
		linesCollection,
		EDITOR_ID,
		configuration,
		model
	);

	callback(viewModel, model);

	viewModel.dispose();
	model.dispose();
	configuration.dispose();
}
