/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePolicy } from './basePolicy.ts';
import type { CategoryDto, PolicyDto } from './policyDto.ts';
import { renderProfileString } from './render.ts';
import { type Category, type NlsString, PolicyType, type LanguageTranslations } from './types.ts';

export class NumberPolicy extends BasePolicy {

	static from(category: CategoryDto, policy: PolicyDto): NumberPolicy | undefined {
		const { type, default: defaultValue, name, minimumVersion, localization } = policy;

		if (type !== 'number') {
			return undefined;
		}

		if (typeof defaultValue !== 'number') {
			throw new Error(`Missing required 'default' property.`);
		}

		return new NumberPolicy(name, { moduleName: '', name: { nlsKey: category.name.key, value: category.name.value } }, minimumVersion, { nlsKey: localization.description.key, value: localization.description.value }, '', defaultValue);
	}

	protected readonly defaultValue: number;

	private constructor(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
		defaultValue: number,
	) {
		super(PolicyType.Number, name, category, minimumVersion, description, moduleName);
		this.defaultValue = defaultValue;
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

	renderJsonValue() {
		return this.defaultValue;
	}

	renderProfileValue() {
		return `<integer>${this.defaultValue}</integer>`;
	}

	renderProfileManifestValue(translations?: LanguageTranslations) {
		return `<key>pfm_default</key>
<integer>${this.defaultValue}</integer>
<key>pfm_description</key>
<string>${renderProfileString(this.name, this.moduleName, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>integer</string>`;
	}
}
