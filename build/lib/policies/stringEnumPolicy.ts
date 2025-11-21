/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePolicy } from './basePolicy.ts';
import type { CategoryDto, PolicyDto } from './policyDto.ts';
import { renderProfileString } from './render.ts';
import { type Category, type NlsString, PolicyType, type LanguageTranslations } from './types.ts';

export class StringEnumPolicy extends BasePolicy {

	static from(category: CategoryDto, policy: PolicyDto): StringEnumPolicy | undefined {
		const { type, name, minimumVersion, enum: enumValue, localization } = policy;

		if (type !== 'string') {
			return undefined;
		}

		const enum_ = enumValue;

		if (!enum_) {
			return undefined;
		}

		if (!localization.enumDescriptions || !Array.isArray(localization.enumDescriptions) || localization.enumDescriptions.length !== enum_.length) {
			throw new Error(`Invalid policy data: enumDescriptions must exist and have the same length as enum_ for policy "${name}".`);
		}
		const enumDescriptions = localization.enumDescriptions.map((e) => ({ nlsKey: e.key, value: e.value }));
		return new StringEnumPolicy(
			name,
			{ moduleName: '', name: { nlsKey: category.name.key, value: category.name.value } },
			minimumVersion,
			{ nlsKey: localization.description.key, value: localization.description.value },
			'',
			enum_,
			enumDescriptions
		);
	}

	protected enum_: string[];
	protected enumDescriptions: NlsString[];

	private constructor(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
		enum_: string[],
		enumDescriptions: NlsString[],
	) {
		super(PolicyType.StringEnum, name, category, minimumVersion, description, moduleName);
		this.enum_ = enum_;
		this.enumDescriptions = enumDescriptions;
	}

	protected renderADMXElements(): string[] {
		return [
			`<enum id="${this.name}" valueName="${this.name}">`,
			...this.enum_.map((value, index) => `	<item displayName="$(string.${this.name}_${this.enumDescriptions[index].nlsKey})"><value><string>${value}</string></value></item>`),
			`</enum>`
		];
	}

	renderADMLStrings(translations?: LanguageTranslations) {
		return [
			...super.renderADMLStrings(translations),
			...this.enumDescriptions.map(e => this.renderADMLString(e, translations))
		];
	}

	renderADMLPresentationContents() {
		return `<dropdownList refId="${this.name}" />`;
	}

	renderJsonValue() {
		return this.enum_[0];
	}

	renderProfileValue() {
		return `<string>${this.enum_[0]}</string>`;
	}

	renderProfileManifestValue(translations?: LanguageTranslations): string {
		return `<key>pfm_default</key>
<string>${this.enum_[0]}</string>
<key>pfm_description</key>
<string>${renderProfileString(this.name, this.moduleName, this.description, translations)}</string>
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
