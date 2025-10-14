/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IFileService } from '../../../files/common/files.js';
import { Category, LanguageTranslations, NlsString, Policy, Translations, Version } from './types.js';
import { IPolicyWriterService } from '../../common/policy.js';
import { renderMacOSPolicy, renderGP, renderJsonPolicies } from './render.js';
import { IConfigurationPropertySchema, IRegisteredConfigurationPropertySchema } from '../../../configuration/common/configurationRegistry.js';
import { BooleanPolicy } from './policies/booleanPolicy.js';
import { NumberPolicy } from './policies/numberPolicy.js';
import { StringPolicy } from './policies/stringPolicy.js';
import { StringEnumPolicy } from './policies/stringEnumPolicy.js';
import { IProductService } from '../../../product/common/productService.js';
import { ObjectPolicy } from './policies/objectPolicy.js';
import { PolicyCategoryTitle } from '../../../../base/common/policy.js';
import { ILogService } from '../../../log/common/log.js';
import { LoggerPrefix } from './constants.js';

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

	constructor(
		@IProductService private readonly productService: IProductService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService
	) { }

	public async write(configs: Array<{ key: string; schema: IRegisteredConfigurationPropertySchema }>, platform: 'darwin' | 'win32'): Promise<void> {
		const translations = await this.getTranslations();
		const policies = this.getPolicies(configs);

		if (platform === 'darwin') {
			await this.writeDarwin(policies, translations);
		} else if (platform === 'win32') {
			await this.writeWindows(policies, translations);
		} else if (platform === 'linux') {
			await this.writeLinux(policies, translations);
		} else {
			throw new Error(`Unsupported platform: ${platform}`);
		}
	}

	private async writeDarwin(policies: Policy[], translations: Translations) {
		const appName = this.productService.nameLong;
		const bundleIdentifier = this.productService.darwinBundleIdentifier;
		const payloadUUID = this.productService.darwinProfilePayloadUUID;
		const UUID = this.productService.darwinProfileUUID;

		if (!appName || !bundleIdentifier || !payloadUUID || !UUID) {
			throw new Error(`Missing required product information.`);
		}

		const { versions, categories } = this.getVersionsAndCategories(policies);
		const root = '.build/policies/darwin';
		const { profile, manifests } = renderMacOSPolicy(appName, bundleIdentifier, payloadUUID, UUID, versions, categories, policies, translations);

		const rootUri = URI.file(path.resolve(root));
		await this.fileService.del(rootUri, { recursive: true, useTrash: false }).catch(() => { /* ignore if doesn't exist */ });
		await this.fileService.createFolder(rootUri);
		const mobileconfigPath = path.join(root, `${bundleIdentifier}.mobileconfig`);
		const mobileconfigUri = URI.file(path.resolve(mobileconfigPath));
		await this.fileService.writeFile(mobileconfigUri, VSBuffer.fromString(profile.replace(/\r?\n/g, '\n')));
		this.logService.info(`${LoggerPrefix} Successfully wrote to ${mobileconfigPath}.`);

		for (const { languageId, contents } of manifests) {
			const languagePath = path.join(root, languageId === 'en-us' ? 'en-us' : Languages[languageId as keyof typeof Languages]);
			const languageUri = URI.file(path.resolve(languagePath));
			await this.fileService.createFolder(languageUri);
			const plistUri = URI.file(path.resolve(path.join(languagePath, `${bundleIdentifier}.plist`)));
			await this.fileService.writeFile(plistUri, VSBuffer.fromString(contents.replace(/\r?\n/g, '\n')));
		}
	}

	private async writeWindows(policies: Policy[], translations: Translations) {
		const appName = this.productService.nameLong;
		const regKey = this.productService.win32RegValueName;

		if (!appName || !regKey) {
			throw new Error(`Missing required product information.`);
		}

		const { versions, categories } = this.getVersionsAndCategories(policies);
		const root = '.build/policies/win32';
		const { admx, adml } = renderGP(this.logService, appName, regKey, versions, categories, policies, translations);

		const rootUri = URI.file(path.resolve(root));
		await this.fileService.del(rootUri, { recursive: true, useTrash: false }).catch(() => { /* ignore if doesn't exist */ });
		await this.fileService.createFolder(rootUri);

		const admxPath = path.join(root, `${this.productService.win32RegValueName}.admx`);
		const admxUri = URI.file(path.resolve(admxPath));
		await this.fileService.writeFile(admxUri, VSBuffer.fromString(admx.replace(/\r?\n/g, '\n')));
		this.logService.info(`${LoggerPrefix} Successfully wrote to ${admxPath}.`);

		for (const { languageId, contents } of adml) {
			const languagePath = path.join(root, languageId === 'en-us' ? 'en-us' : Languages[languageId as keyof typeof Languages]);
			const languageUri = URI.file(path.resolve(languagePath));
			await this.fileService.createFolder(languageUri);
			const admlUri = URI.file(path.resolve(path.join(languagePath, `${this.productService.win32RegValueName}.adml`)));
			await this.fileService.writeFile(admlUri, VSBuffer.fromString(contents.replace(/\r?\n/g, '\n')));
		}
	}

	private async writeLinux(policies: Policy[], translations: Translations) {
		const appName = this.productService.nameLong;

		if (!appName) {
			throw new Error(`Missing required product information.`);
		}

		const root = '.build/policies/linux';
		const { jsonPolicies } = renderJsonPolicies(this.logService, policies, translations);

		for (const { languageId, contents } of jsonPolicies) {
			const languagePath = path.join(root, languageId === 'en-us' ? '' : Languages[languageId as keyof typeof Languages]);
			const languageUri = URI.file(path.resolve(languagePath));
			await this.fileService.createFolder(languageUri);
			const admlUri = URI.file(path.resolve(path.join(languagePath, `policy.json`)));
			await this.fileService.writeFile(admlUri, VSBuffer.fromString(JSON.stringify(contents, undefined, 4).replace(/\r?\n/g, '\n')));
		}
	}

	private configToPolicy(key: string, config: IConfigurationPropertySchema): Policy {
		let convertedPolicy: Policy | undefined;
		const policy = config.policy;
		if (!policy) {
			throw new Error(`Invalid config for key ${key}: missing required 'policy' key.`);
		}

		const category: Category = { name: { nlsKey: policy.category, value: PolicyCategoryTitle[policy.category] } };

		const descriptionKey = typeof policy.localization.description === 'object' ? policy.localization.description.key : policy.localization.description;
		const descriptionValue = typeof policy.localization.description === 'object' ? policy.localization.description.value : config.description;
		if (!descriptionValue) {
			throw new Error(`Invalid config for key ${key}: missing required 'description' key. If only a key is provided, then the parent configuration object must define it.`);
		}

		const policyDescription: NlsString = {
			nlsKey: descriptionKey,
			value: descriptionValue
		};

		const expectedNumberEnumKeys = config.enum?.length ?? 0;
		const actualNumberEnumKeys = policy.localization.enumDescriptions?.length ?? 0;
		if (actualNumberEnumKeys !== expectedNumberEnumKeys) {
			throw new Error(`Invalid config for key ${key}: expected ${expectedNumberEnumKeys} localization keys but found ${actualNumberEnumKeys}`);
		}

		const policyEnumDescriptions: NlsString[] = policy.localization.enumDescriptions?.map((enumDescription, idx) => {
			const enumDescriptionKey = typeof enumDescription === 'object' ? enumDescription.key : enumDescription;
			const enumDescriptionValue = typeof enumDescription === 'object' ? enumDescription.value : config.enumDescriptions?.[idx];
			if (!enumDescriptionValue) {
				throw new Error(`Invalid config for key ${key}: missing value for enumDescription at index ${idx}`);
			}
			return {
				nlsKey: enumDescriptionKey,
				value: enumDescriptionValue
			};
		}) ?? [];

		const logger = this.logService;
		switch (config.type) {
			case 'boolean':
				convertedPolicy = BooleanPolicy.from({ key, policy, category, policyDescription, config, logger });
				break;
			case 'number':
			case 'integer':
				convertedPolicy = NumberPolicy.from({ key, policy, category, policyDescription, config, logger });
				break;
			case 'array':
			case 'object':
				convertedPolicy = ObjectPolicy.from({ key, policy, category, policyDescription, config, logger });
				break;
			case 'string':
				if (config.enum) {
					convertedPolicy = StringEnumPolicy.from({ key, policy, category, policyDescription, policyEnumDescriptions, config, logger });
				} else {
					convertedPolicy = StringPolicy.from({ key, policy, category, policyDescription, config, logger });
				}
				break;
		}
		if (!convertedPolicy) {
			throw new Error(`Failed to convert ${key}: ${JSON.stringify(config)}`);
		}
		return convertedPolicy;
	}

	private getPolicies(configs: Array<{ key: string; schema: IRegisteredConfigurationPropertySchema }>): Policy[] {
		return configs.map(({ key, schema }) => this.configToPolicy(key, schema)).sort((a, b) => {
			// Order by category first, then within the groups sort alphabetically. This attempts to keep
			// similar configurations together, but we can revisit this later if we need a custom ordering.
			const categoryCompare = a.category.name.nlsKey.localeCompare(b.category.name.nlsKey);
			if (categoryCompare !== 0) {
				return categoryCompare;
			}
			return a.name.localeCompare(b.name);
		});
	}

	private getVersionsAndCategories(policies: Policy[]) {
		const versions = [...new Set(policies.map(p => p.minimumVersion)).values()].sort();
		const categories = ([...Object.values(policies.reduce((acc, p) => ({ ...acc, [p.category.name.nlsKey]: p.category }), {}))] as Category[]).sort((a, b) => a.name.nlsKey.localeCompare(b.name.nlsKey));
		return { versions, categories };
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

		const { contents: result } = await res.json() as { contents: { [moduleName: string]: LanguageTranslations } };

		// Assumption: all the localization keys we care about are unique. There is a similar comment in the `IPolicy.localization` property
		// that warns consumers about this localization quirk.
		const flattenedResult: LanguageTranslations = Object.values(result).reduce((acc, translations) => ({ ...acc, ...translations }), {});
		return flattenedResult;
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
