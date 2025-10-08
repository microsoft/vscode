/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as path from '../../../../base/common/path.js';
import { Category, LanguageTranslations, Policy, Translations, Version } from './types.js';
import { IPolicyWriterService } from '../../common/policy.js';
import { renderADMLString } from './policies/render.js';
import { IConfigurationPropertySchema, IRegisteredConfigurationPropertySchema } from '../../../configuration/common/configurationRegistry.js';
import { BooleanPolicy } from './policies/booleanPolicy.js';
import { NumberPolicy } from './policies/numberPolicy.js';
import { StringPolicy } from './policies/stringPolicy.js';
import { StringEnumPolicy } from './policies/stringEnumPolicy.js';
import { IProductService } from '../../../product/common/productService.js';
import { ObjectPolicy } from './policies/objectPolicy.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';

const Languages = {
	'fr': 'fr-fr',
	'it': 'it-it',
	'de': 'de-de',
	'es': 'es-es',
	'ru': 'ru-ru',
	'zh-hans': 'zh-cn',
	'zh-hant': 'zh-tw',
	'ja': 'ja-jp',
	'ko': 'ko-kr',
	'cs': 'cs-cz',
	'pt-br': 'pt-br',
	'tr': 'tr-tr',
	'pl': 'pl-pl',
};

export class PolicyWriterService implements IPolicyWriterService {
	_serviceBrand: undefined;

	constructor(@IConfigurationService public readonly configurationService: IConfigurationService, @IProductService private readonly productService: IProductService) { }

	public async write(configs: Array<{ key: string; schema: IRegisteredConfigurationPropertySchema }>, platform: 'darwin' | 'win32'): Promise<void> {
		const translations = await this.getTranslations();
		const policies = this.getPolicies(configs);

		if (platform === 'darwin') {
			await this.writeDarwin(policies, translations);
		} else if (platform === 'win32') {
			await this.writeWindows(policies, translations);
		} else {
			throw new Error(`Unsupported platform: ${platform}`);
		}
	}

	private async writeDarwin(policies: Policy[], translations: Translations) {
		const bundleIdentifier = this.productService.darwinBundleIdentifier;
		if (!bundleIdentifier) {
			throw new Error(`Missing required product information 1.`);
		}
		const root = '.build/policies/darwin';
		const { profile, manifests } = this.renderMacOSPolicy(policies, translations);

		await fs.rm(root, { recursive: true, force: true });
		await fs.mkdir(root, { recursive: true });
		await fs.writeFile(path.join(root, `${bundleIdentifier}.mobileconfig`), profile.replace(/\r?\n/g, '\n'));

		for (const { languageId, contents } of manifests) {
			const languagePath = path.join(root, languageId === 'en-us' ? 'en-us' : Languages[languageId as keyof typeof Languages]);
			await fs.mkdir(languagePath, { recursive: true });
			await fs.writeFile(path.join(languagePath, `${bundleIdentifier}.plist`), contents.replace(/\r?\n/g, '\n'));
		}
	}

	private async writeWindows(policies: Policy[], translations: Translations) {
		const root = '.build/policies/win32';
		const { admx, adml } = this.renderGP(policies, translations);

		await fs.rm(root, { recursive: true, force: true });
		await fs.mkdir(root, { recursive: true });

		await fs.writeFile(path.join(root, `${this.productService.win32RegValueName}.admx`), admx.replace(/\r?\n/g, '\n'));

		for (const { languageId, contents } of adml) {
			const languagePath = path.join(root, languageId === 'en-us' ? 'en-us' : Languages[languageId as keyof typeof Languages]);
			await fs.mkdir(languagePath, { recursive: true });
			await fs.writeFile(path.join(languagePath, `${this.productService.win32RegValueName}.adml`), contents.replace(/\r?\n/g, '\n'));
		}
	}

	private configToPolicy(key: string, config: IConfigurationPropertySchema): Policy {
		let convertedPolicy: Policy | undefined;
		switch (config.type) {
			case 'boolean':
				convertedPolicy = BooleanPolicy.from(config);
				break;
			case 'number':
			case 'integer':
				convertedPolicy = NumberPolicy.from(config);
				break;
			case 'array':
			case 'object':
				convertedPolicy = ObjectPolicy.from(config);
				break;
			case 'string':
				if (config.enum) {
					convertedPolicy = StringEnumPolicy.from(config);
				} else {
					convertedPolicy = StringPolicy.from(config);
				}
				break;
		}
		if (!convertedPolicy) {
			throw new Error(`Failed to convert ${key}: ${JSON.stringify(config)}`);
		}
		return convertedPolicy;
	}

	private getPolicies(configs: Array<{ key: string; schema: IRegisteredConfigurationPropertySchema }>): Policy[] {
		return configs.map(({ key, schema }) => this.configToPolicy(key, schema));
	}

	private renderADMX(regKey: string, versions: string[], categories: Category[], policies: Policy[]) {
		versions = versions.map(v => v.replace(/\./g, '_'));

		return `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions revision="1.1" schemaVersion="1.0">
	<policyNamespaces>
		<target prefix="${regKey}" namespace="Microsoft.Policies.${regKey}" />
	</policyNamespaces>
	<resources minRequiredRevision="1.0" />
	<supportedOn>
		<definitions>
			${versions.map(v => `<definition name="Supported_${v}" displayName="$(string.Supported_${v})" />`).join(`\n			`)}
		</definitions>
	</supportedOn>
	<categories>
		<category displayName="$(string.Application)" name="Application" />
		${categories.map(c => `<category displayName="$(string.Category_${c.name.nlsKey})" name="${c.name.nlsKey}"><parentCategory ref="Application" /></category>`).join(`\n		`)}
	</categories>
	<policies>
		${policies.map(p => p.renderADMX(regKey)).flat().join(`\n		`)}
	</policies>
</policyDefinitions>
`;
	}

	private renderADML(appName: string, versions: string[], categories: Category[], policies: Policy[], translations?: LanguageTranslations) {
		return `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources revision="1.0" schemaVersion="1.0">
	<displayName />
	<description />
	<resources>
		<stringTable>
			<string id="Application">${appName}</string>
			${versions.map(v => `<string id="Supported_${v.replace(/\./g, '_')}">${appName} &gt;= ${v}</string>`).join(`\n			`)}
			${categories.map(c => renderADMLString('Category', c.name, translations)).join(`\n			`)}
			${policies.map(p => p.renderADMLStrings(translations)).flat().join(`\n			`)}
		</stringTable>
		<presentationTable>
			${policies.map(p => p.renderADMLPresentation()).join(`\n			`)}
		</presentationTable>
	</resources>
</policyDefinitionResources>
`;
	}

	private renderProfileManifest(appName: string, bundleIdentifier: string, _versions: string[], _categories: Category[], policies: Policy[], translations?: LanguageTranslations) {

		const requiredPayloadFields = `
		<dict>
			<key>pfm_default</key>
			<string>Configure ${appName}</string>
			<key>pfm_name</key>
			<string>PayloadDescription</string>
			<key>pfm_title</key>
			<string>Payload Description</string>
			<key>pfm_type</key>
			<string>string</string>
		</dict>
		<dict>
			<key>pfm_default</key>
			<string>${appName}</string>
			<key>pfm_name</key>
			<string>PayloadDisplayName</string>
			<key>pfm_require</key>
			<string>always</string>
			<key>pfm_title</key>
			<string>Payload Display Name</string>
			<key>pfm_type</key>
			<string>string</string>
		</dict>
		<dict>
			<key>pfm_default</key>
			<string>${bundleIdentifier}</string>
			<key>pfm_name</key>
			<string>PayloadIdentifier</string>
			<key>pfm_require</key>
			<string>always</string>
			<key>pfm_title</key>
			<string>Payload Identifier</string>
			<key>pfm_type</key>
			<string>string</string>
		</dict>
		<dict>
			<key>pfm_default</key>
			<string>${bundleIdentifier}</string>
			<key>pfm_name</key>
			<string>PayloadType</string>
			<key>pfm_require</key>
			<string>always</string>
			<key>pfm_title</key>
			<string>Payload Type</string>
			<key>pfm_type</key>
			<string>string</string>
		</dict>
		<dict>
			<key>pfm_default</key>
			<string></string>
			<key>pfm_name</key>
			<string>PayloadUUID</string>
			<key>pfm_require</key>
			<string>always</string>
			<key>pfm_title</key>
			<string>Payload UUID</string>
			<key>pfm_type</key>
			<string>string</string>
		</dict>
		<dict>
			<key>pfm_default</key>
			<integer>1</integer>
			<key>pfm_name</key>
			<string>PayloadVersion</string>
			<key>pfm_range_list</key>
			<array>
				<integer>1</integer>
			</array>
			<key>pfm_require</key>
			<string>always</string>
			<key>pfm_title</key>
			<string>Payload Version</string>
			<key>pfm_type</key>
			<string>integer</string>
		</dict>
		<dict>
			<key>pfm_default</key>
			<string>Microsoft</string>
			<key>pfm_name</key>
			<string>PayloadOrganization</string>
			<key>pfm_title</key>
			<string>Payload Organization</string>
			<key>pfm_type</key>
			<string>string</string>
		</dict>`;

		const profileManifestSubkeys = policies.map(policy => {
			return policy.renderProfileManifest(translations);
		}).join('');

		return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>pfm_app_url</key>
	<string>https://code.visualstudio.com/</string>
	<key>pfm_description</key>
	<string>${appName} Managed Settings</string>
	<key>pfm_documentation_url</key>
	<string>https://code.visualstudio.com/docs/setup/enterprise</string>
	<key>pfm_domain</key>
	<string>${bundleIdentifier}</string>
	<key>pfm_format_version</key>
	<integer>1</integer>
	<key>pfm_interaction</key>
	<string>combined</string>
	<key>pfm_last_modified</key>
	<date>${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</date>
	<key>pfm_platforms</key>
	<array>
		<string>macOS</string>
	</array>
	<key>pfm_subkeys</key>
	<array>
	${requiredPayloadFields}
	${profileManifestSubkeys}
	</array>
	<key>pfm_title</key>
	<string>${appName}</string>
	<key>pfm_unique</key>
	<true/>
	<key>pfm_version</key>
	<integer>1</integer>
</dict>
</plist>`;
	}

	private renderMacOSPolicy(policies: Policy[], translations: Translations) {
		const appName = this.productService.nameLong;
		const bundleIdentifier = this.productService.darwinBundleIdentifier;
		const payloadUUID = this.productService.darwinProfilePayloadUUID;
		const UUID = this.productService.darwinProfileUUID;

		if (!appName || !bundleIdentifier) {
			throw new Error(`Missing required product information 2.`);
		}

		const versions = [...new Set(policies.map(p => p.minimumVersion)).values()].sort();
		const categories = [...new Set(policies.map(p => p.category))];

		const policyEntries =
			policies.map(policy => policy.renderProfile())
				.flat()
				.map(entry => `\t\t\t\t${entry}`)
				.join('\n');


		return {
			profile: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
	<dict>
		<key>PayloadContent</key>
		<array>
			<dict>
				<key>PayloadDisplayName</key>
				<string>${appName}</string>
				<key>PayloadIdentifier</key>
				<string>${bundleIdentifier}.${UUID}</string>
				<key>PayloadType</key>
				<string>${bundleIdentifier}</string>
				<key>PayloadUUID</key>
				<string>${UUID}</string>
				<key>PayloadVersion</key>
				<integer>1</integer>
${policyEntries}
			</dict>
		</array>
		<key>PayloadDescription</key>
		<string>This profile manages ${appName}. For more information see https://code.visualstudio.com/docs/setup/enterprise</string>
		<key>PayloadDisplayName</key>
		<string>${appName}</string>
		<key>PayloadIdentifier</key>
		<string>${bundleIdentifier}</string>
		<key>PayloadOrganization</key>
		<string>Microsoft</string>
		<key>PayloadType</key>
		<string>Configuration</string>
		<key>PayloadUUID</key>
		<string>${payloadUUID}</string>
		<key>PayloadVersion</key>
		<integer>1</integer>
		<key>TargetDeviceType</key>
		<integer>5</integer>
	</dict>
</plist>`,
			manifests: [{ languageId: 'en-us', contents: this.renderProfileManifest(appName, bundleIdentifier, versions, categories, policies) },
			...translations.map(({ languageId, languageTranslations }) =>
				({ languageId, contents: this.renderProfileManifest(appName, bundleIdentifier, versions, categories, policies, languageTranslations) }))
			]
		};
	}

	private renderGP(policies: Policy[], translations: Translations) {
		const appName = this.productService.nameLong;
		const regKey = this.productService.win32RegValueName;

		if (!regKey) {
			throw new Error(`Missing required product information 3.`);
		}

		const versions = [...new Set(policies.map(p => p.minimumVersion)).values()].sort();
		const categories = [...Object.values(policies.reduce((acc, p) => ({ ...acc, [p.category.name.nlsKey]: p.category }), {}))] as Category[];

		return {
			admx: this.renderADMX(regKey, versions, categories, policies),
			adml: [
				{ languageId: 'en-us', contents: this.renderADML(appName, versions, categories, policies) },
				...translations.map(({ languageId, languageTranslations }) =>
					({ languageId, contents: this.renderADML(appName, versions, categories, policies, languageTranslations) }))
			]
		};
	}


	private async getSpecificNLS(resourceUrlTemplate: string, languageId: string, version: Version) {
		const resource = {
			publisher: 'ms-ceintl',
			name: `vscode-language-pack-${languageId}`,
			version: `${version[0]}.${version[1]}.${version[2]}`,
			path: 'extension/translations/main.i18n.json'
		};

		const url = resourceUrlTemplate.replace(/\{([^}]+)\}/g, (_, key) => resource[key as keyof typeof resource]);
		const res = await fetch(url);

		if (res.status !== 200) {
			throw new Error(`[${res.status}] Error downloading language pack ${languageId}@${version}`);
		}

		const { contents: result } = await res.json() as { contents: LanguageTranslations };
		return result;
	}

	private parseVersion(version: string): Version {
		const [, major, minor, patch] = /^(\d+)\.(\d+)\.(\d+)/.exec(version)!;
		return [parseInt(major), parseInt(minor), parseInt(patch)];
	}

	private compareVersions(a: Version, b: Version): number {
		if (a[0] !== b[0]) { return a[0] - b[0]; }
		if (a[1] !== b[1]) { return a[1] - b[1]; }
		return a[2] - b[2];
	}

	private async queryVersions(serviceUrl: string, languageId: string): Promise<Version[]> {
		const res = await fetch(`${serviceUrl}/extensionquery`, {
			method: 'POST',
			headers: {
				'Accept': 'application/json;api-version=3.0-preview.1',
				'Content-Type': 'application/json',
				'User-Agent': 'VS Code Build',
			},
			body: JSON.stringify({
				filters: [{ criteria: [{ filterType: 7, value: `ms-ceintl.vscode-language-pack-${languageId}` }] }],
				flags: 0x1
			})
		});

		if (res.status !== 200) {
			throw new Error(`[${res.status}] Error querying for extension: ${languageId}`);
		}

		const result = await res.json() as { results: [{ extensions: { versions: { version: string }[] }[] }] };
		return result.results[0].extensions[0].versions.map(v => this.parseVersion(v.version)).sort(this.compareVersions);
	}

	private async getNLS(extensionGalleryServiceUrl: string, resourceUrlTemplate: string, languageId: string, version: Version) {
		const versions = await this.queryVersions(extensionGalleryServiceUrl, languageId);
		const nextMinor: Version = [version[0], version[1] + 1, 0];
		const compatibleVersions = versions.filter(v => this.compareVersions(v, nextMinor) < 0);
		const latestCompatibleVersion = compatibleVersions.at(-1)!; // order is newest to oldest

		if (!latestCompatibleVersion) {
			throw new Error(`No compatible language pack found for ${languageId} for version ${version}`);
		}

		return await this.getSpecificNLS(resourceUrlTemplate, languageId, latestCompatibleVersion);
	}

	private async getTranslations(): Promise<Translations> {
		const extensionGalleryServiceUrl = this.productService.extensionsGallery?.serviceUrl;

		if (!extensionGalleryServiceUrl) {
			console.warn(`Skipping policy localization: No 'extensionGallery.serviceUrl' found in 'product.json'.`);
			return [];
		}

		const resourceUrlTemplate = this.productService.extensionsGallery?.resourceUrlTemplate;

		if (!resourceUrlTemplate) {
			console.warn(`Skipping policy localization: No 'resourceUrlTemplate' found in 'product.json'.`);
			return [];
		}

		const version = this.parseVersion(this.productService.version);
		const languageIds = Object.keys(Languages);

		return await Promise.all(languageIds.map(
			languageId => this.getNLS(extensionGalleryServiceUrl, resourceUrlTemplate, languageId, version)
				.then(languageTranslations => ({ languageId, languageTranslations }))
		));
	}
}
