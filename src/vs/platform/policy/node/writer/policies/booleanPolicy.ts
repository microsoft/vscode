/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PolicyCategory } from '../../../../../base/common/policy.js';
import { IConfigurationPropertySchema } from '../../../../configuration/common/configurationRegistry.js';
import { LanguageTranslations, NlsString, PolicyType } from '../types.js';
import { BasePolicy } from './basePolicy.js';
import { renderProfileString } from './render.js';

export class BooleanPolicy extends BasePolicy {

	static from(config: IConfigurationPropertySchema): BooleanPolicy | undefined {
		if (!config.policy) {
			throw new Error(`[BooleanPolicy] Unexpected: missing 'policy' property`);
		}

		if (config.type !== 'boolean') {
			throw new Error(`[BooleanPolicy] Unsupported 'type' property: ${config.type}`);
		}

		if (config.default === undefined) {
			throw new Error(`[BooleanPolicy] Missing required 'default' property.`);
		}

		// console.log('@@@POLICY', config.policy);

		const description = config.policy.description.value ?? config.description;
		if (description === undefined) {
			throw new Error(`[BooleanPolicy] Missing required 'description' property.`);
		}

		return new BooleanPolicy(config.policy.name, config.policy.category, config.policy.minimumVersion, {
			nlsKey: config.policy.description.key,
			value: description
		});
	}

	private constructor(
		name: string,
		category: PolicyCategory,
		minimumVersion: string,
		description: NlsString,
	) {
		super(PolicyType.Boolean, name, {
			moduleName: category,
			name: {
				nlsKey: category,
				value: category
			}
		}, minimumVersion, description);
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

	renderProfileValue(): string {
		return `<false/>`;
	}

	renderProfileManifestValue(translations?: LanguageTranslations): string {
		return `<key>pfm_default</key>
<false/>
<key>pfm_description</key>
<string>${renderProfileString(this.name, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>boolean</string>`;
	}
}
