/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PolicyCategory } from '../../../../../base/common/policy.js';
import { IConfigurationPropertySchema } from '../../../../configuration/common/configurationRegistry.js';
import { LanguageTranslations, NlsString, PolicyType } from '../types.js';
import { BasePolicy } from './basePolicy.js';
import { renderProfileString } from './render.js';

export class NumberPolicy extends BasePolicy {

	static from(config: IConfigurationPropertySchema): NumberPolicy | undefined {
		if (!config.policy) {
			throw new Error(`[NumberPolicy] Unexpected: missing 'policy' property`);
		}

		if (config.type !== 'number' && config.type !== 'integer') {
			throw new Error(`[NumberPolicy] Unsupported 'type' property: ${config.type}`);
		}

		if (config.default === undefined) {
			throw new Error(`[NumberPolicy] Missing required 'default' property.`);
		}

		const description = config.policy.description.value ?? config.description;
		if (description === undefined) {
			throw new Error(`[NumberPolicy] Missing required 'description' property.`);
		}

		return new NumberPolicy(config.policy.name, config.policy.category, config.policy.minimumVersion, {
			nlsKey: config.policy.description.key,
			value: description
		}, config.default);
	}

	private constructor(
		name: string,
		category: PolicyCategory,
		minimumVersion: string,
		description: NlsString,
		protected readonly defaultValue: number,
	) {
		super(PolicyType.Number, name, {
			name: {
				nlsKey: category,
				value: category
			},
			moduleName: category
		}, minimumVersion, description);
	}

	protected renderADMXElements(): string[] {
		return [
			`<decimal id="${this.name}" valueName="${this.name}" />`
			// `<decimal id="Quarantine_PurgeItemsAfterDelay" valueName="PurgeItemsAfterDelay" minValue="0" maxValue="10000000" />`
		];
	}

	renderADMLPresentationContents() {
		return `<decimalTextBox refId="${this.name}" defaultValue="${this.defaultValue}">${this.name}</decimalTextBox>`;
	}

	renderProfileValue() {
		return `<integer>${this.defaultValue}</integer>`;
	}

	renderProfileManifestValue(translations?: LanguageTranslations) {
		return `<key>pfm_default</key>
<integer>${this.defaultValue}</integer>
<key>pfm_description</key>
<string>${renderProfileString(this.name, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>integer</string>`;
	}
}
