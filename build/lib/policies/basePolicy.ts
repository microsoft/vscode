/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderADMLString } from './render.ts';
import type { Category, LanguageTranslations, NlsString, Policy, PolicyType } from './types.ts';

export abstract class BasePolicy implements Policy {
	readonly type: PolicyType;
	readonly name: string;
	readonly category: Category;
	readonly minimumVersion: string;
	protected description: NlsString;
	protected moduleName: string;

	constructor(
		type: PolicyType,
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
	) {
		this.type = type;
		this.name = name;
		this.category = category;
		this.minimumVersion = minimumVersion;
		this.description = description;
		this.moduleName = moduleName;
	}

	protected renderADMLString(nlsString: NlsString, translations?: LanguageTranslations): string {
		return renderADMLString(this.name, this.moduleName, nlsString, translations);
	}

	renderADMX(regKey: string) {
		return [
			`<policy name="${this.name}" class="Both" displayName="$(string.${this.name})" explainText="$(string.${this.name}_${this.description.nlsKey.replace(/\./g, '_')})" key="Software\\Policies\\Microsoft\\${regKey}" presentation="$(presentation.${this.name})">`,
			`	<parentCategory ref="${this.category.name.nlsKey}" />`,
			`	<supportedOn ref="Supported_${this.minimumVersion.replace(/\./g, '_')}" />`,
			`	<elements>`,
			...this.renderADMXElements(),
			`	</elements>`,
			`</policy>`
		];
	}

	protected abstract renderADMXElements(): string[];

	renderADMLStrings(translations?: LanguageTranslations) {
		return [
			`<string id="${this.name}">${this.name}</string>`,
			this.renderADMLString(this.description, translations)
		];
	}

	renderADMLPresentation(): string {
		return `<presentation id="${this.name}">${this.renderADMLPresentationContents()}</presentation>`;
	}

	protected abstract renderADMLPresentationContents(): string;

	renderProfile() {
		return [`<key>${this.name}</key>`, this.renderProfileValue()];
	}

	renderProfileManifest(translations?: LanguageTranslations): string {
		return `<dict>
${this.renderProfileManifestValue(translations)}
</dict>`;
	}

	abstract renderJsonValue(): string | number | boolean | object | null;
	abstract renderProfileValue(): string;
	abstract renderProfileManifestValue(translations?: LanguageTranslations): string;
}
