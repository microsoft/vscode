"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const minimist_1 = __importDefault(require("minimist"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const JSONC = __importStar(require("jsonc-parser"));
const product = require('../../../product.json');
const packageJson = require('../../../package.json');
var PolicyType;
(function (PolicyType) {
    PolicyType["Boolean"] = "boolean";
    PolicyType["Number"] = "number";
    PolicyType["Object"] = "object";
    PolicyType["String"] = "string";
    PolicyType["StringEnum"] = "stringEnum";
})(PolicyType || (PolicyType = {}));
function renderADMLString(prefix, moduleName, nlsString, translations) {
    let value;
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
function renderProfileString(_prefix, moduleName, nlsString, translations) {
    let value;
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
class BasePolicy {
    type;
    name;
    category;
    minimumVersion;
    description;
    moduleName;
    constructor(type, name, category, minimumVersion, description, moduleName) {
        this.type = type;
        this.name = name;
        this.category = category;
        this.minimumVersion = minimumVersion;
        this.description = description;
        this.moduleName = moduleName;
    }
    renderADMLString(nlsString, translations) {
        return renderADMLString(this.name, this.moduleName, nlsString, translations);
    }
    renderADMX(regKey) {
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
    renderADMLStrings(translations) {
        return [
            `<string id="${this.name}">${this.name}</string>`,
            this.renderADMLString(this.description, translations)
        ];
    }
    renderADMLPresentation() {
        return `<presentation id="${this.name}">${this.renderADMLPresentationContents()}</presentation>`;
    }
    renderProfile() {
        return [`<key>${this.name}</key>`, this.renderProfileValue()];
    }
    renderProfileManifest(translations) {
        return `<dict>
${this.renderProfileManifestValue(translations)}
</dict>`;
    }
}
class BooleanPolicy extends BasePolicy {
    static from(category, policy) {
        const { name, minimumVersion, localization, type } = policy;
        if (type !== 'boolean') {
            return undefined;
        }
        return new BooleanPolicy(name, { moduleName: '', name: { nlsKey: category.name.key, value: category.name.value } }, minimumVersion, { nlsKey: localization.description.key, value: localization.description.value }, '');
    }
    constructor(name, category, minimumVersion, description, moduleName) {
        super(PolicyType.Boolean, name, category, minimumVersion, description, moduleName);
    }
    renderADMXElements() {
        return [
            `<boolean id="${this.name}" valueName="${this.name}">`,
            `	<trueValue><decimal value="1" /></trueValue><falseValue><decimal value="0" /></falseValue>`,
            `</boolean>`
        ];
    }
    renderADMLPresentationContents() {
        return `<checkBox refId="${this.name}">${this.name}</checkBox>`;
    }
    renderProfileValue() {
        return `<false/>`;
    }
    renderProfileManifestValue(translations) {
        return `<key>pfm_default</key>
<false/>
<key>pfm_description</key>
<string>${renderProfileString(this.name, this.moduleName, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>boolean</string>`;
    }
}
class NumberPolicy extends BasePolicy {
    defaultValue;
    static from(category, policy) {
        const { type, default: defaultValue, name, minimumVersion, localization } = policy;
        if (type !== 'number') {
            return undefined;
        }
        if (typeof defaultValue !== 'number') {
            throw new Error(`Missing required 'default' property.`);
        }
        return new NumberPolicy(name, { moduleName: '', name: { nlsKey: category.name.key, value: category.name.value } }, minimumVersion, { nlsKey: localization.description.key, value: localization.description.value }, '', defaultValue);
    }
    constructor(name, category, minimumVersion, description, moduleName, defaultValue) {
        super(PolicyType.StringEnum, name, category, minimumVersion, description, moduleName);
        this.defaultValue = defaultValue;
    }
    renderADMXElements() {
        return [
            `<decimal id="${this.name}" valueName="${this.name}" />`
            // `<decimal id="Quarantine_PurgeItemsAfterDelay" valueName="PurgeItemsAfterDelay" minValue="0" maxValue="10000000" />`
        ];
    }
    renderADMLPresentationContents() {
        return `<decimalTextBox refId="${this.name}" defaultValue="${this.defaultValue}">${this.name}</decimalTextBox>`;
    }
    renderProfileValue() {
        return `<integer>${this.defaultValue}</integer>`;
    }
    renderProfileManifestValue(translations) {
        return `<key>pfm_default</key>
<integer>${this.defaultValue}</integer>
<key>pfm_description</key>
<string>${renderProfileString(this.name, this.moduleName, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>integer</string>`;
    }
}
class StringPolicy extends BasePolicy {
    static from(category, policy) {
        const { type, name, minimumVersion, localization } = policy;
        if (type !== 'string') {
            return undefined;
        }
        return new StringPolicy(name, { moduleName: '', name: { nlsKey: category.name.key, value: category.name.value } }, minimumVersion, { nlsKey: localization.description.key, value: localization.description.value }, '');
    }
    constructor(name, category, minimumVersion, description, moduleName) {
        super(PolicyType.String, name, category, minimumVersion, description, moduleName);
    }
    renderADMXElements() {
        return [`<text id="${this.name}" valueName="${this.name}" required="true" />`];
    }
    renderADMLPresentationContents() {
        return `<textBox refId="${this.name}"><label>${this.name}:</label></textBox>`;
    }
    renderProfileValue() {
        return `<string></string>`;
    }
    renderProfileManifestValue(translations) {
        return `<key>pfm_default</key>
<string></string>
<key>pfm_description</key>
<string>${renderProfileString(this.name, this.moduleName, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>string</string>`;
    }
}
class ObjectPolicy extends BasePolicy {
    static from(category, policy) {
        const { type, name, minimumVersion, localization } = policy;
        if (type !== 'object' && type !== 'array') {
            return undefined;
        }
        return new ObjectPolicy(name, { moduleName: '', name: { nlsKey: category.name.key, value: category.name.value } }, minimumVersion, { nlsKey: localization.description.key, value: localization.description.value }, '');
    }
    constructor(name, category, minimumVersion, description, moduleName) {
        super(PolicyType.Object, name, category, minimumVersion, description, moduleName);
    }
    renderADMXElements() {
        return [`<multiText id="${this.name}" valueName="${this.name}" required="true" />`];
    }
    renderADMLPresentationContents() {
        return `<multiTextBox refId="${this.name}" />`;
    }
    renderProfileValue() {
        return `<string></string>`;
    }
    renderProfileManifestValue(translations) {
        return `<key>pfm_default</key>
<string></string>
<key>pfm_description</key>
<string>${renderProfileString(this.name, this.moduleName, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>string</string>
`;
    }
}
class StringEnumPolicy extends BasePolicy {
    enum_;
    enumDescriptions;
    static from(category, policy) {
        const { type, name, minimumVersion, enum: enumValue, localization } = policy;
        if (type !== 'string') {
            return undefined;
        }
        const enum_ = enumValue;
        if (!enum_) {
            return undefined;
        }
        if (!localization.enumDescriptions || !Array.isArray(localization.enumDescriptions) || localization.enumDescriptions.length !== enum_.length) {
            throw new Error(`Invalid policy data: enumDescriptions must exist and have the same length as enum_ for policy "${name}".`);
        }
        const enumDescriptions = localization.enumDescriptions.map((e) => ({ nlsKey: e.key, value: e.value }));
        return new StringEnumPolicy(name, { moduleName: '', name: { nlsKey: category.name.key, value: category.name.value } }, minimumVersion, { nlsKey: localization.description.key, value: localization.description.value }, '', enum_, enumDescriptions);
    }
    constructor(name, category, minimumVersion, description, moduleName, enum_, enumDescriptions) {
        super(PolicyType.StringEnum, name, category, minimumVersion, description, moduleName);
        this.enum_ = enum_;
        this.enumDescriptions = enumDescriptions;
    }
    renderADMXElements() {
        return [
            `<enum id="${this.name}" valueName="${this.name}">`,
            ...this.enum_.map((value, index) => `	<item displayName="$(string.${this.name}_${this.enumDescriptions[index].nlsKey})"><value><string>${value}</string></value></item>`),
            `</enum>`
        ];
    }
    renderADMLStrings(translations) {
        return [
            ...super.renderADMLStrings(translations),
            ...this.enumDescriptions.map(e => this.renderADMLString(e, translations))
        ];
    }
    renderADMLPresentationContents() {
        return `<dropdownList refId="${this.name}" />`;
    }
    renderProfileValue() {
        return `<string>${this.enum_[0]}</string>`;
    }
    renderProfileManifestValue(translations) {
        return `<key>pfm_default</key>
<string>${this.enum_[0]}</string>
<key>pfm_description</key>
<string>${renderProfileString(this.name, this.moduleName, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>string</string>
<key>pfm_range_list</key>
<array>
	${this.enum_.map(e => `<string>${e}</string>`).join('\n	')}
</array>`;
    }
}
function renderADMX(regKey, versions, categories, policies) {
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
function renderADML(appName, versions, categories, policies, translations) {
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
function renderProfileManifest(appName, bundleIdentifier, _versions, _categories, policies, translations) {
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
function renderMacOSPolicy(policies, translations) {
    const appName = product.nameLong;
    const bundleIdentifier = product.darwinBundleIdentifier;
    const payloadUUID = product.darwinProfilePayloadUUID;
    const UUID = product.darwinProfileUUID;
    const versions = [...new Set(policies.map(p => p.minimumVersion)).values()].sort();
    const categories = [...new Set(policies.map(p => p.category))];
    const policyEntries = policies.map(policy => policy.renderProfile())
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
            ...translations.map(({ languageId, languageTranslations }) => ({ languageId, contents: renderProfileManifest(appName, bundleIdentifier, versions, categories, policies, languageTranslations) }))
        ]
    };
}
function renderGP(policies, translations) {
    const appName = product.nameLong;
    const regKey = product.win32RegValueName;
    const versions = [...new Set(policies.map(p => p.minimumVersion)).values()].sort();
    const categories = [...Object.values(policies.reduce((acc, p) => ({ ...acc, [p.category.name.nlsKey]: p.category }), {}))];
    return {
        admx: renderADMX(regKey, versions, categories, policies),
        adml: [
            { languageId: 'en-us', contents: renderADML(appName, versions, categories, policies) },
            ...translations.map(({ languageId, languageTranslations }) => ({ languageId, contents: renderADML(appName, versions, categories, policies, languageTranslations) }))
        ]
    };
}
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
async function getSpecificNLS(resourceUrlTemplate, languageId, version) {
    const resource = {
        publisher: 'ms-ceintl',
        name: `vscode-language-pack-${languageId}`,
        version: `${version[0]}.${version[1]}.${version[2]}`,
        path: 'extension/translations/main.i18n.json'
    };
    const url = resourceUrlTemplate.replace(/\{([^}]+)\}/g, (_, key) => resource[key]);
    const res = await fetch(url);
    if (res.status !== 200) {
        throw new Error(`[${res.status}] Error downloading language pack ${languageId}@${version}`);
    }
    const { contents: result } = await res.json();
    // TODO: support module namespacing
    // Flatten all moduleName keys to empty string
    const flattened = { '': {} };
    for (const moduleName in result) {
        for (const nlsKey in result[moduleName]) {
            flattened[''][nlsKey] = result[moduleName][nlsKey];
        }
    }
    return flattened;
}
function parseVersion(version) {
    const [, major, minor, patch] = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
    return [parseInt(major), parseInt(minor), parseInt(patch)];
}
function compareVersions(a, b) {
    if (a[0] !== b[0]) {
        return a[0] - b[0];
    }
    if (a[1] !== b[1]) {
        return a[1] - b[1];
    }
    return a[2] - b[2];
}
async function queryVersions(serviceUrl, languageId) {
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
    const result = await res.json();
    return result.results[0].extensions[0].versions.map(v => parseVersion(v.version)).sort(compareVersions);
}
async function getNLS(extensionGalleryServiceUrl, resourceUrlTemplate, languageId, version) {
    const versions = await queryVersions(extensionGalleryServiceUrl, languageId);
    const nextMinor = [version[0], version[1] + 1, 0];
    const compatibleVersions = versions.filter(v => compareVersions(v, nextMinor) < 0);
    const latestCompatibleVersion = compatibleVersions.at(-1); // order is newest to oldest
    if (!latestCompatibleVersion) {
        throw new Error(`No compatible language pack found for ${languageId} for version ${version}`);
    }
    return await getSpecificNLS(resourceUrlTemplate, languageId, latestCompatibleVersion);
}
// TODO: add more policy types
const PolicyTypes = [
    BooleanPolicy,
    NumberPolicy,
    StringEnumPolicy,
    StringPolicy,
    ObjectPolicy
];
async function parsePolicies(policyDataFile) {
    const contents = JSONC.parse(await fs_1.promises.readFile(policyDataFile, { encoding: 'utf8' }));
    const categories = new Map();
    for (const category of contents.categories) {
        categories.set(category.key, category);
    }
    const policies = [];
    for (const policy of contents.policies) {
        const category = categories.get(policy.category);
        if (!category) {
            throw new Error(`Unknown category: ${policy.category}`);
        }
        let result;
        for (const policyType of PolicyTypes) {
            if (result = policyType.from(category, policy)) {
                break;
            }
        }
        if (!result) {
            throw new Error(`Unsupported policy type: ${policy.type} for policy ${policy.name}`);
        }
        policies.push(result);
    }
    // Sort policies first by category name, then by policy name
    policies.sort((a, b) => {
        const categoryCompare = a.category.name.value.localeCompare(b.category.name.value);
        if (categoryCompare !== 0) {
            return categoryCompare;
        }
        return a.name.localeCompare(b.name);
    });
    return policies;
}
async function getTranslations() {
    const extensionGalleryServiceUrl = product.extensionsGallery?.serviceUrl;
    if (!extensionGalleryServiceUrl) {
        console.warn(`Skipping policy localization: No 'extensionGallery.serviceUrl' found in 'product.json'.`);
        return [];
    }
    const resourceUrlTemplate = product.extensionsGallery?.resourceUrlTemplate;
    if (!resourceUrlTemplate) {
        console.warn(`Skipping policy localization: No 'resourceUrlTemplate' found in 'product.json'.`);
        return [];
    }
    const version = parseVersion(packageJson.version);
    const languageIds = Object.keys(Languages);
    return await Promise.all(languageIds.map(languageId => getNLS(extensionGalleryServiceUrl, resourceUrlTemplate, languageId, version)
        .then(languageTranslations => ({ languageId, languageTranslations }))));
}
async function windowsMain(policies, translations) {
    const root = '.build/policies/win32';
    const { admx, adml } = await renderGP(policies, translations);
    await fs_1.promises.rm(root, { recursive: true, force: true });
    await fs_1.promises.mkdir(root, { recursive: true });
    await fs_1.promises.writeFile(path_1.default.join(root, `${product.win32RegValueName}.admx`), admx.replace(/\r?\n/g, '\n'));
    for (const { languageId, contents } of adml) {
        const languagePath = path_1.default.join(root, languageId === 'en-us' ? 'en-us' : Languages[languageId]);
        await fs_1.promises.mkdir(languagePath, { recursive: true });
        await fs_1.promises.writeFile(path_1.default.join(languagePath, `${product.win32RegValueName}.adml`), contents.replace(/\r?\n/g, '\n'));
    }
}
async function darwinMain(policies, translations) {
    const bundleIdentifier = product.darwinBundleIdentifier;
    if (!bundleIdentifier || !product.darwinProfilePayloadUUID || !product.darwinProfileUUID) {
        throw new Error(`Missing required product information.`);
    }
    const root = '.build/policies/darwin';
    const { profile, manifests } = await renderMacOSPolicy(policies, translations);
    await fs_1.promises.rm(root, { recursive: true, force: true });
    await fs_1.promises.mkdir(root, { recursive: true });
    await fs_1.promises.writeFile(path_1.default.join(root, `${bundleIdentifier}.mobileconfig`), profile.replace(/\r?\n/g, '\n'));
    for (const { languageId, contents } of manifests) {
        const languagePath = path_1.default.join(root, languageId === 'en-us' ? 'en-us' : Languages[languageId]);
        await fs_1.promises.mkdir(languagePath, { recursive: true });
        await fs_1.promises.writeFile(path_1.default.join(languagePath, `${bundleIdentifier}.plist`), contents.replace(/\r?\n/g, '\n'));
    }
}
async function main() {
    const args = (0, minimist_1.default)(process.argv.slice(2));
    if (args._.length !== 2) {
        console.error(`Usage: node build/lib/policies <policy-data-file> <darwin|win32>`);
        process.exit(1);
    }
    const policyDataFile = args._[0];
    const platform = args._[1];
    const [policies, translations] = await Promise.all([parsePolicies(policyDataFile), getTranslations()]);
    if (platform === 'darwin') {
        await darwinMain(policies, translations);
    }
    else if (platform === 'win32') {
        await windowsMain(policies, translations);
    }
    else {
        console.error(`Usage: node build/lib/policies <policy-data-file> <darwin|win32>`);
        process.exit(1);
    }
}
if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=policyGenerator.js.map