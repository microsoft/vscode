/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicy } from '../../../../../base/common/policy.js';
import { IConfigurationPropertySchema } from '../../../../configuration/common/configurationRegistry.js';
import { Category, LanguageTranslations, NlsString, PolicyType } from '../types.js';
import { BasePolicy } from './basePolicy.js';
import { renderProfileString } from '../render.js';
import { ILogger } from '../../../../log/common/log.js';

export class StringPolicy extends BasePolicy {

	static from({ policy, category, policyDescription, logger }: { key: string; policy: IPolicy; category: Category; policyDescription: NlsString; config: IConfigurationPropertySchema; logger: ILogger }): StringPolicy {
		return new StringPolicy(policy.name, category, policy.minimumVersion, policyDescription, logger);
	}

	private constructor(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		logger: ILogger
	) {
		super(PolicyType.String, name, category, minimumVersion, description, logger);
	}

	protected renderADMXElements(): string[] {
		return [`<text id="${this.name}" valueName="${this.name}" required="true" />`];
	}

	protected renderADMLPresentationContents() {
		return `<textBox refId="${this.name}"><label>${this.name}:</label></textBox>`;
	}

	renderProfileValue(): string {
		return `<string></string>`;
	}

	renderProfileManifestValue(translations?: LanguageTranslations): string {
		return `<key>pfm_default</key>
<string></string>
<key>pfm_description</key>
<string>${renderProfileString(this.logger, this.name, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>string</string>`;
	}
}
