/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicy } from '../../../../../base/common/policy.js';
import { IConfigurationPropertySchema } from '../../../../configuration/common/configurationRegistry.js';
import { Category, LanguageTranslations, NlsString, PolicyType } from '../types.js';
import { BasePolicy } from './basePolicy.js';
import { renderProfileString } from './render.js';

export class StringEnumPolicy extends BasePolicy {

	static from({ key, policy, category, policyDescription, policyEnumDescriptions, config }: { key: string; policy: IPolicy; category: Category; policyDescription: NlsString; policyEnumDescriptions: NlsString[]; config: IConfigurationPropertySchema }): StringEnumPolicy {
		if (!config.enum) {
			throw new Error(`[StringEnumPolicy] Failed to convert ${key}: missing required 'enum' property.`);
		}

		if (!config.enumDescriptions) {
			throw new Error(`[StringEnumPolicy] Failed to convert ${key}: missing required 'enumDescriptions' property.`);
		}

		const defaultValue = config.enum[0];
		return new StringEnumPolicy(policy.name, category, policy.minimumVersion, policyDescription, defaultValue, config.enum, policyEnumDescriptions);
	}

	private constructor(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		protected defaultValue: string,
		protected enum_: string[],
		protected enumDescriptions: NlsString[],
	) {
		super(PolicyType.StringEnum, name, category, minimumVersion, description);
	}

	protected renderADMXElements(): string[] {
		return [
			`<enum id="${this.name}" valueName="${this.name}">`,
			...this.enum_.map((value, index) => `	<item displayName="$(string.${this.name}_${this.enumDescriptions[index].nlsKey})"><value><string>${value}</string></value></item>`),
			`</enum>`
		];
	}

	override renderADMLStrings(translations?: LanguageTranslations) {
		return [
			...super.renderADMLStrings(translations),
			...this.enumDescriptions.map(e => this.renderADMLString(e, translations))
		];
	}

	protected renderADMLPresentationContents() {
		return `<dropdownList refId="${this.name}" />`;
	}

	renderProfileValue() {
		return `<string>${this.defaultValue}</string>`;
	}

	renderProfileManifestValue(translations?: LanguageTranslations): string {
		return `<key>pfm_default</key>
<string>${this.defaultValue}</string>
<key>pfm_description</key>
<string>${renderProfileString(this.name, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>string</string>
<key>pfm_range_list</key>
<array>
	${this.enum_.map(e => `<string>${e}</string>`).join('\n	')}
</array>`;
	}
}
