/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePolicy } from './basePolicy.ts';
import type { CategoryDto, PolicyDto } from './policyDto.ts';
import { renderProfileString } from './render.ts';
import { type Category, type NlsString, PolicyType, type LanguageTranslations } from './types.ts';

export class BooleanPolicy extends BasePolicy {

	static from(category: CategoryDto, policy: PolicyDto): BooleanPolicy | undefined {
		const { name, minimumVersion, localization, type } = policy;

		if (type !== 'boolean') {
			return undefined;
		}

		return new BooleanPolicy(name, { moduleName: '', name: { nlsKey: category.name.key, value: category.name.value } }, minimumVersion, { nlsKey: localization.description.key, value: localization.description.value }, '');
	}

	private constructor(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
	) {
		super(PolicyType.Boolean, name, category, minimumVersion, description, moduleName);
	}

	protected renderADMXElements(): string[] {
		return [
			`<boolean id="${this.name}" valueName="${this.name}">`,
			`	<trueValue><decimal value="1" /></trueValue><falseValue><decimal value="0" /></falseValue>`,
			`</boolean>`
		];
	}

	renderADMLPresentationContents() {
		return `<checkBox refId="${this.name}">${this.name}</checkBox>`;
	}

	renderJsonValue() {
		return false;
	}

	renderProfileValue(): string {
		return `<false/>`;
	}

	renderProfileManifestValue(translations?: LanguageTranslations): string {
		return `<key>pfm_default</key>
<false/>
<key>pfm_description</key>
<string>${renderProfileString(this.name, this.moduleName, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>boolean</string>`;
	}
}
