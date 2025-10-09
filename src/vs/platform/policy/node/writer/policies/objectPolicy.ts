/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicy } from '../../../../../base/common/policy.js';
import { IConfigurationPropertySchema } from '../../../../configuration/common/configurationRegistry.js';
import { Category, LanguageTranslations, NlsString, PolicyType } from '../types.js';
import { BasePolicy } from './basePolicy.js';
import { renderProfileString } from './render.js';

export class ObjectPolicy extends BasePolicy {

	static from({ key, policy, category, policyDescription, config }: { key: string; policy: IPolicy; category: Category; policyDescription: NlsString; config: IConfigurationPropertySchema }): ObjectPolicy {
		if (config.default === undefined) {
			throw new Error(`[ObjectPolicy] Failed to convert ${key}: missing required 'default' property.`);
		}
		return new ObjectPolicy(policy.name, category, policy.minimumVersion, policyDescription);
	}

	private constructor(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
	) {
		super(PolicyType.Object, name, category, minimumVersion, description);
	}

	protected renderADMXElements(): string[] {
		return [`<multiText id="${this.name}" valueName="${this.name}" required="true" />`];
	}

	protected renderADMLPresentationContents() {
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
