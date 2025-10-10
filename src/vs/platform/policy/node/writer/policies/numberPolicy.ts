/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicy } from '../../../../../base/common/policy.js';
import { IConfigurationPropertySchema } from '../../../../configuration/common/configurationRegistry.js';
import { Category, LanguageTranslations, NlsString, PolicyType } from '../types.js';
import { BasePolicy } from './basePolicy.js';
import { renderProfileString } from '../render.js';
import { ILogger } from '../../../../log/common/log.js';

export class NumberPolicy extends BasePolicy {

	static from({ key, policy, category, policyDescription, config, logger }: { key: string; policy: IPolicy; category: Category; policyDescription: NlsString; config: IConfigurationPropertySchema; logger: ILogger }): NumberPolicy {
		if (config.default === undefined) {
			throw new Error(`[NumberPolicy] Failed to convert ${key}: missing required 'default' property.`);
		}
		return new NumberPolicy(policy.name, category, policy.minimumVersion, policyDescription, config.default, logger);
	}

	private constructor(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		protected readonly defaultValue: number,
		logger: ILogger,
	) {
		super(PolicyType.Number, name, category, minimumVersion, description, logger);
	}

	protected renderADMXElements(): string[] {
		return [
			`<decimal id="${this.name}" valueName="${this.name}" />`
			// `<decimal id="Quarantine_PurgeItemsAfterDelay" valueName="PurgeItemsAfterDelay" minValue="0" maxValue="10000000" />`
		];
	}

	protected renderADMLPresentationContents() {
		return `<decimalTextBox refId="${this.name}" defaultValue="${this.defaultValue}">${this.name}</decimalTextBox>`;
	}

	renderProfileValue() {
		return `<integer>${this.defaultValue}</integer>`;
	}

	renderProfileManifestValue(translations?: LanguageTranslations) {
		return `<key>pfm_default</key>
<integer>${this.defaultValue}</integer>
<key>pfm_description</key>
<string>${renderProfileString(this.logger, this.name, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>integer</string>`;
	}
}
