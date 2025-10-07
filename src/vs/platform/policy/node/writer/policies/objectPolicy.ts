/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PolicyCategory } from '../../../../../base/common/policy.js';
import { IConfigurationPropertySchema } from '../../../../configuration/common/configurationRegistry.js';
import { LanguageTranslations, NlsString, PolicyType } from '../types.js';
import { BasePolicy } from './basePolicy.js';
import { renderProfileString } from './render.js';

export class ObjectPolicy extends BasePolicy {

	static from(config: IConfigurationPropertySchema): ObjectPolicy | undefined {
		if (!config.policy) {
			throw new Error(`[ObjectPolicy] Unexpected: missing 'policy' property`);
		}

		if (config.type !== 'object' && config.type !== 'array') {
			throw new Error(`[ObjectPolicy] Unsupported 'type' property: ${config.type}`);
		}

		if (config.default === undefined) {
			throw new Error(`[ObjectPolicy] Missing required 'default' property.`);
		}

		const description = config.policy.description ?? config.description ?? config.markdownDescription;
		if (description === undefined) {
			throw new Error(`[ObjectPolicy] Missing required 'description' property.`);
		}

		return new ObjectPolicy(config.policy.name, config.policy.category, config.policy.minimumVersion, {
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
		super(PolicyType.Object, name, {
			moduleName: category,
			name: {
				nlsKey: category,
				value: category
			}
		}, minimumVersion, description);
	}

	protected renderADMXElements(): string[] {
		return [`<multiText id="${this.name}" valueName="${this.name}" required="true" />`];
	}

	renderADMLPresentationContents() {
		return `<multiTextBox refId="${this.name}" />`;
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
<string>string</string>
`;
	}
}
