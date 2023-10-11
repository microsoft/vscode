/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { localize } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ISpeechService, SpeechService } from 'vs/workbench/contrib/speech/common/speechService';

registerSingleton(ISpeechService, SpeechService, InstantiationType.Delayed);

registerAction2(class extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.testSpeechToText',
			title: { value: localize('speechToText', "Speech to Text"), original: 'Speech to Text' },
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const speechService = accessor.get(ISpeechService);
		const result = speechService.speechToText('embedded-azure-sdk', CancellationToken.None);

		result(e => {
			console.log(e);
		});
	}
});
