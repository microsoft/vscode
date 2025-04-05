/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorOptions } from '../../../common/config/editorOptions.js';
import { TextModel } from '../../../common/model/textModel.js';
import { ViewModel } from '../../../common/viewModel/viewModelImpl.js';
import { TestConfiguration } from '../config/testConfiguration.js';
import { MonospaceLineBreaksComputerFactory } from '../../../common/viewModel/monospaceLineBreaksComputer.js';
import { createTextModel } from '../../common/testTextModel.js';
import { TestLanguageConfigurationService } from '../../common/modes/testLanguageConfigurationService.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';

export function testViewModel(text: string[], options: IEditorOptions, callback: (viewModel: ViewModel, model: TextModel) => void): void {
	const EDITOR_ID = 1;

	const configuration = new TestConfiguration(options);
	const model = createTextModel(text.join('\n'));
	const monospaceLineBreaksComputerFactory = MonospaceLineBreaksComputerFactory.create(configuration.options);
	const testLanguageConfigurationService = new TestLanguageConfigurationService();
	const viewModel = new ViewModel(EDITOR_ID, configuration, model, monospaceLineBreaksComputerFactory, monospaceLineBreaksComputerFactory, null!, testLanguageConfigurationService, new TestThemeService(), {
		setVisibleLines(visibleLines, stabilized) {
		},
	}, {
		batchChanges: (cb) => cb(),
	});

	callback(viewModel, model);

	viewModel.dispose();
	model.dispose();
	configuration.dispose();
	testLanguageConfigurationService.dispose();
}
