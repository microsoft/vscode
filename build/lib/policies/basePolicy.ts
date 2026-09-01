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
		if (!type) {
			throw new Error("BasePolicy: 'type' parametresi zorunludur ve boş bırakılamaz.");
		}
		if (!name || typeof name !== 'string' || name.trim() === '') {
			throw new Error("BasePolicy: Geçerli bir 'name' değeri gereklidir.");
		}
		if (!category) {
			throw new Error("BasePolicy: 'category' parametresi zorunludur.");
		}
		if (!minimumVersion || typeof minimumVersion !== 'string' || !/^\d+(\.\d+)*$/.test(minimumVersion)) {
			throw new Error(`BasePolicy: Geçersiz 'minimumVersion' formatı (${minimumVersion}). Sürüm numarası sayısal değerlerden oluşmalıdır (örn. '1.0.0').`);
		}
		if (!description || !description.nlsKey) {
			throw new Error("BasePolicy: Geçerli bir 'description' ve 'nlsKey' gereklidir.");
		}
		if (!moduleName || typeof moduleName !== 'string' || moduleName.trim() === '') {
			throw new Error("BasePolicy: Geçerli bir 'moduleName' değeri gereklidir.");
		}

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
