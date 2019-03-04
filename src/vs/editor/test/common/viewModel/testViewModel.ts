/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { TextModel } from 'vs/editor/common/model/textModel';
import { ViewModel } from 'vs/editor/common/viewModel/viewModelImpl';
import { TestConfiguration } from 'vs/editor/test/common/mocks/testConfiguration';

export function testViewModel(text: string[], options: IEditorOptions, callback: (viewModel: ViewModel, model: TextModel) => void): void {
	const EDITOR_ID = 1;

	let configuration = new TestConfiguration(options);

	let model = TextModel.createFromString(text.join('\n'));

	let viewModel = new ViewModel(EDITOR_ID, configuration, model, null!);

	callback(viewModel, model);

	viewModel.dispose();
	model.dispose();
	configuration.dispose();
}
