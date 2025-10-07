/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PolicyCategory } from '../../../../../base/common/policy.js';
import { IConfigurationPropertySchema } from '../../../../configuration/common/configurationRegistry.js';
import { LanguageTranslations, NlsString, PolicyType } from '../types.js';
import { BasePolicy } from './basePolicy.js';
import { renderProfileString } from './render.js';

export class StringEnumPolicy extends BasePolicy {

	static from(config: IConfigurationPropertySchema): StringEnumPolicy | undefined {
		if (!config.policy) {
			throw new Error(`[StringEnumPolicy] Unexpected: missing 'policy' property`);
		}

		if (config.type !== 'string') {
			throw new Error(`[StringEnumPolicy] Unsupported 'type' property: ${config.type}`);
		}

		const description = config.policy.description ?? config.description ?? config.markdownDescription;
		if (description === undefined) {
			throw new Error(`[StringEnumPolicy] Missing required 'description' property.`);
		}

		const enum_ = config.enum;

		if (!enum_) {
			return undefined;
		}

		if (!isStringArray(enum_)) {
			throw new Error(`[StringEnumPolicy] Property 'enum' should not be localized.`);
		}

		const enumDescriptions = config.enumDescriptions;

		if (!enumDescriptions) {
			throw new Error(`[StringEnumPolicy] Missing required 'enumDescriptions' property.`);
		}

		return new StringEnumPolicy(config.policy.name, config.policy.category, config.policy.minimumVersion, {
			nlsKey: description,
			value: description
		}, enum_, enumDescriptions.map((d) => ({ nlsKey: d, value: d })));
	}

	private constructor(
		name: string,
		category: PolicyCategory,
		minimumVersion: string,
		description: NlsString,
		protected enum_: string[],
		protected enumDescriptions: NlsString[],
	) {
		super(PolicyType.StringEnum, name, {
			moduleName: category,
			name: {
				nlsKey: category,
				value: category
			}
		}, minimumVersion, description);
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

	renderADMLPresentationContents() {
		return `<dropdownList refId="${this.name}" />`;
	}

	renderProfileValue() {
		return `<string>${this.enum_[0]}</string>`;
	}

	renderProfileManifestValue(translations?: LanguageTranslations): string {
		return `<key>pfm_default</key>
<string>${this.enum_[0]}</string>
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

function isNlsString(value: string | NlsString | undefined): value is NlsString {
	return value ? typeof value !== 'string' : false;
}

function isStringArray(value: (string | NlsString)[]): value is string[] {
	return !value.some(s => isNlsString(s));
}
