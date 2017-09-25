/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Model } from 'vs/editor/common/model/model';
import { TestConfiguration } from 'vs/editor/test/common/mocks/testConfiguration';
import { ViewModel } from 'vs/editor/common/viewModel/viewModelImpl';
import { MockCodeEditorCreationOptions } from 'vs/editor/test/common/mocks/mockCodeEditor';

export function testViewModel(text: string[], options: MockCodeEditorCreationOptions, callback: (viewModel: ViewModel, model: Model) => void): void {
	const EDITOR_ID = 1;

	let configuration = new TestConfiguration(options);

	let model = Model.createFromString(text.join('\n'));

	let viewModel = new ViewModel(EDITOR_ID, configuration, model, null);

	callback(viewModel, model);

	viewModel.dispose();
	model.dispose();
	configuration.dispose();
}
