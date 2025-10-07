/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PolicyCategory } from '../../../../../base/common/policy.js';
import { IConfigurationPropertySchema } from '../../../../configuration/common/configurationRegistry.js';
import { LanguageTranslations, NlsString, PolicyType } from '../types.js';
import { BasePolicy } from './basePolicy.js';
import { renderProfileString } from './render.js';

export class StringPolicy extends BasePolicy {

	static from(config: IConfigurationPropertySchema): StringPolicy | undefined {
		if (!config.policy) {
			throw new Error(`[StringPolicy] Unexpected: missing 'policy' property`);
		}

		if (config.type !== 'string') {
			throw new Error(`[StringPolicy] Unsupported 'type' property: ${config.type}`);
		}

		if (config.default === undefined) {
			throw new Error(`[StringPolicy] Missing required 'default' property.`);
		}

		const description = config.policy.description ?? config.description ?? config.markdownDescription;
		if (description === undefined) {
			throw new Error(`[StringPolicy] Missing required 'description' property.`);
		}

		return new StringPolicy(config.policy.name, config.policy.category, config.policy.minimumVersion, {
			nlsKey: description,
			value: description
		});
	}

	private constructor(
		name: string,
		category: PolicyCategory,
		minimumVersion: string,
		description: NlsString,
	) {
		super(PolicyType.String, name, {
			moduleName: category,
			name: {
				nlsKey: category,
				value: category
			}
		}, minimumVersion, description);
	}

	protected renderADMXElements(): string[] {
		return [`<text id="${this.name}" valueName="${this.name}" required="true" />`];
	}

	renderADMLPresentationContents() {
		return `<textBox refId="${this.name}"><label>${this.name}:</label></textBox>`;
	}

	renderProfileValue(): string {
		return `<string></string>`;
	}

	renderProfileManifestValue(translations?: LanguageTranslations): string {
		return `<key>pfm_default</key>
<string></string>
<key>pfm_description</key>
<string>${renderProfileString(this.name, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>string</string>`;
	}
}
