/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { NlsString, LanguageTranslations, Category, Policy, Translations, ProductJson } from './types.ts';

export function renderADMLString(prefix: string, moduleName: string, nlsString: NlsString, translations?: LanguageTranslations): string {
	let value: string | undefined;

	if (translations) {
		const moduleTranslations = translations[moduleName];

		if (moduleTranslations) {
			value = moduleTranslations[nlsString.nlsKey];
		}
	}

	if (!value) {
		value = nlsString.value;
	}

	return `<string id="${prefix}_${nlsString.nlsKey.replace(/\./g, '_')}">${value}</string>`;
}

export function renderProfileString(_prefix: string, moduleName: string, nlsString: NlsString, translations?: LanguageTranslations): string {
	let value: string | undefined;

	if (translations) {
		const moduleTranslations = translations[moduleName];

		if (moduleTranslations) {
			value = moduleTranslations[nlsString.nlsKey];
		}
	}

	if (!value) {
		value = nlsString.value;
	}

	return value;
}

export function renderADMX(regKey: string, versions: string[], categories: Category[], policies: Policy[]) {
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

export function renderADML(appName: string, versions: string[], categories: Category[], policies: Policy[], translations?: LanguageTranslations) {
	return `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources revision="1.0" schemaVersion="1.0">
	<displayName />
	<description />
	<resources>
		<stringTable>
			<string id="Application">${appName}</string>
			${versions.map(v => `<string id="Supported_${v.replace(/\./g, '_')}">${appName} &gt;= ${v}</string>`).join(`\n			`)}
			${categories.map(c => renderADMLString('Category', c.moduleName, c.name, translations)).join(`\n			`)}
			${policies.map(p => p.renderADMLStrings(translations)).flat().join(`\n			`)}
		</stringTable>
		<presentationTable>
			${policies.map(p => p.renderADMLPresentation()).join(`\n			`)}
		</presentationTable>
	</resources>
</policyDefinitionResources>
`;
}

export function renderProfileManifest(appName: string, bundleIdentifier: string, _versions: string[], _categories: Category[], policies: Policy[], translations?: LanguageTranslations) {

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

export function renderMacOSPolicy(product: ProductJson, policies: Policy[], translations: Translations) {
	const appName = product.nameLong;
	const bundleIdentifier = product.darwinBundleIdentifier;
	const payloadUUID = product.darwinProfilePayloadUUID;
	const UUID = product.darwinProfileUUID;

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
		manifests: [{ languageId: 'en-us', contents: renderProfileManifest(appName, bundleIdentifier, versions, categories, policies) },
		...translations.map(({ languageId, languageTranslations }) =>
			({ languageId, contents: renderProfileManifest(appName, bundleIdentifier, versions, categories, policies, languageTranslations) }))
		]
	};
}

export function renderGP(product: ProductJson, policies: Policy[], translations: Translations) {
	const appName = product.nameLong;
	const regKey = product.win32RegValueName;

	const versions = [...new Set(policies.map(p => p.minimumVersion)).values()].sort();
	const categories = [...Object.values(policies.reduce((acc, p) => ({ ...acc, [p.category.name.nlsKey]: p.category }), {}))] as Category[];

	return {
		admx: renderADMX(regKey, versions, categories, policies),
		adml: [
			{ languageId: 'en-us', contents: renderADML(appName, versions, categories, policies) },
			...translations.map(({ languageId, languageTranslations }) =>
				({ languageId, contents: renderADML(appName, versions, categories, policies, languageTranslations) }))
		]
	};
}

export function renderJsonPolicies(policies: Policy[]) {
	const policyObject: { [key: string]: string | number | boolean | object | null } = {};
	for (const policy of policies) {
		policyObject[policy.name] = policy.renderJsonValue();
	}
	return policyObject;
}
