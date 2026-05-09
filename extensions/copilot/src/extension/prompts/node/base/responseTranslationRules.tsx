/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps } from '@vscode/prompt-tsx';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IEnvService } from '../../../../platform/env/common/envService';

export const validLocales = [
	'auto',
	'en',
	'fr',
	'it',
	'de',
	'es',
	'ru',
	'zh-CN',
	'zh-TW',
	'ja',
	'ko',
	'cs',
	'pt-br',
	'tr',
	'pl'
];

export class ResponseTranslationRules extends PromptElement {

	constructor(
		props: PromptElementProps<{}>,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvService private readonly envService: IEnvService,
	) {
		super(props);
	}

	render() {
		const languageOverride = this.configurationService.getConfig<string>(ConfigKey.LocaleOverride); // Locale overrides must be for one of our supported languages
		if (!validLocales.find((locale) => languageOverride === locale)) {
			return undefined;
		}
		const languageConfiguration = languageOverride !== 'auto' ? languageOverride : this.envService.language; // No need to further validate VS Code's configured locale
		if (languageConfiguration === 'en') {
			return undefined;
		}

		return (
			<>
				Respond in the following locale: {languageConfiguration}
			</>
		);
	}
}
