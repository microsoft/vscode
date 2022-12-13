"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path = require("path");
const byline = require("byline");
const ripgrep_1 = require("@vscode/ripgrep");
const Parser = require("tree-sitter");
const node_fetch_1 = require("node-fetch");
const { typescript } = require('tree-sitter-typescript');
const product = require('../../product.json');
const packageJson = require('../../package.json');
function isNlsString(value) {
    return value ? typeof value !== 'string' : false;
}
function isStringArray(value) {
    return !value.some(s => isNlsString(s));
}
function isNlsStringArray(value) {
    return value.every(s => isNlsString(s));
}
var PolicyType;
(function (PolicyType) {
    PolicyType[PolicyType["StringEnum"] = 0] = "StringEnum";
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
    return `<string id="${prefix}_${nlsString.nlsKey}">${value}</string>`;
}
class BasePolicy {
    policyType;
    name;
    category;
    minimumVersion;
    description;
    moduleName;
    constructor(policyType, name, category, minimumVersion, description, moduleName) {
        this.policyType = policyType;
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
            `<policy name="${this.name}" class="Both" displayName="$(string.${this.name})" explainText="$(string.${this.name}_${this.description.nlsKey})" key="Software\\Policies\\Microsoft\\${regKey}" presentation="$(presentation.${this.name})">`,
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
}
class BooleanPolicy extends BasePolicy {
    static from(name, category, minimumVersion, description, moduleName, settingNode) {
        const type = getStringProperty(settingNode, 'type');
        if (type !== 'boolean') {
            return undefined;
        }
        return new BooleanPolicy(name, category, minimumVersion, description, moduleName);
    }
    constructor(name, category, minimumVersion, description, moduleName) {
        super(PolicyType.StringEnum, name, category, minimumVersion, description, moduleName);
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
}
class IntPolicy extends BasePolicy {
    defaultValue;
    static from(name, category, minimumVersion, description, moduleName, settingNode) {
        const type = getStringProperty(settingNode, 'type');
        if (type !== 'number') {
            return undefined;
        }
        const defaultValue = getIntProperty(settingNode, 'default');
        if (typeof defaultValue === 'undefined') {
            throw new Error(`Missing required 'default' property.`);
        }
        return new IntPolicy(name, category, minimumVersion, description, moduleName, defaultValue);
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
}
class StringPolicy extends BasePolicy {
    static from(name, category, minimumVersion, description, moduleName, settingNode) {
        const type = getStringProperty(settingNode, 'type');
        if (type !== 'string') {
            return undefined;
        }
        return new StringPolicy(name, category, minimumVersion, description, moduleName);
    }
    constructor(name, category, minimumVersion, description, moduleName) {
        super(PolicyType.StringEnum, name, category, minimumVersion, description, moduleName);
    }
    renderADMXElements() {
        return [`<text id="${this.name}" valueName="${this.name}" required="true" />`];
    }
    renderADMLPresentationContents() {
        return `<textBox refId="${this.name}"><label>${this.name}:</label></textBox>`;
    }
}
class StringEnumPolicy extends BasePolicy {
    enum_;
    enumDescriptions;
    static from(name, category, minimumVersion, description, moduleName, settingNode) {
        const type = getStringProperty(settingNode, 'type');
        if (type !== 'string') {
            return undefined;
        }
        const enum_ = getStringArrayProperty(settingNode, 'enum');
        if (!enum_) {
            return undefined;
        }
        if (!isStringArray(enum_)) {
            throw new Error(`Property 'enum' should not be localized.`);
        }
        const enumDescriptions = getStringArrayProperty(settingNode, 'enumDescriptions');
        if (!enumDescriptions) {
            throw new Error(`Missing required 'enumDescriptions' property.`);
        }
        else if (!isNlsStringArray(enumDescriptions)) {
            throw new Error(`Property 'enumDescriptions' should be localized.`);
        }
        return new StringEnumPolicy(name, category, minimumVersion, description, moduleName, enum_, enumDescriptions);
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
}
const IntQ = {
    Q: `(number) @value`,
    value(matches) {
        const match = matches[0];
        if (!match) {
            return undefined;
        }
        const value = match.captures.filter(c => c.name === 'value')[0]?.node.text;
        if (!value) {
            throw new Error(`Missing required 'value' property.`);
        }
        return parseInt(value);
    }
};
const StringQ = {
    Q: `[
		(string (string_fragment) @value)
		(call_expression function: (identifier) @localizeFn arguments: (arguments (string (string_fragment) @nlsKey) (string (string_fragment) @value)) (#eq? @localizeFn localize))
	]`,
    value(matches) {
        const match = matches[0];
        if (!match) {
            return undefined;
        }
        const value = match.captures.filter(c => c.name === 'value')[0]?.node.text;
        if (!value) {
            throw new Error(`Missing required 'value' property.`);
        }
        const nlsKey = match.captures.filter(c => c.name === 'nlsKey')[0]?.node.text;
        if (nlsKey) {
            return { value, nlsKey };
        }
        else {
            return value;
        }
    }
};
const StringArrayQ = {
    Q: `(array ${StringQ.Q})`,
    value(matches) {
        if (matches.length === 0) {
            return undefined;
        }
        return matches.map(match => {
            return StringQ.value([match]);
        });
    }
};
function getProperty(qtype, node, key) {
    const query = new Parser.Query(typescript, `(
			(pair
				key: [(property_identifier)(string)] @key
				value: ${qtype.Q}
			)
			(#eq? @key ${key})
		)`);
    return qtype.value(query.matches(node));
}
function getIntProperty(node, key) {
    return getProperty(IntQ, node, key);
}
function getStringProperty(node, key) {
    return getProperty(StringQ, node, key);
}
function getStringArrayProperty(node, key) {
    return getProperty(StringArrayQ, node, key);
}
// TODO: add more policy types
const PolicyTypes = [
    BooleanPolicy,
    IntPolicy,
    StringEnumPolicy,
    StringPolicy,
];
function getPolicy(moduleName, configurationNode, settingNode, policyNode, categories) {
    const name = getStringProperty(policyNode, 'name');
    if (!name) {
        throw new Error(`Missing required 'name' property.`);
    }
    else if (isNlsString(name)) {
        throw new Error(`Property 'name' should be a literal string.`);
    }
    const categoryName = getStringProperty(configurationNode, 'title');
    if (!categoryName) {
        throw new Error(`Missing required 'title' property.`);
    }
    else if (!isNlsString(categoryName)) {
        throw new Error(`Property 'title' should be localized.`);
    }
    const categoryKey = `${categoryName.nlsKey}:${categoryName.value}`;
    let category = categories.get(categoryKey);
    if (!category) {
        category = { moduleName, name: categoryName };
        categories.set(categoryKey, category);
    }
    const minimumVersion = getStringProperty(policyNode, 'minimumVersion');
    if (!minimumVersion) {
        throw new Error(`Missing required 'minimumVersion' property.`);
    }
    else if (isNlsString(minimumVersion)) {
        throw new Error(`Property 'minimumVersion' should be a literal string.`);
    }
    const description = getStringProperty(settingNode, 'description');
    if (!description) {
        throw new Error(`Missing required 'description' property.`);
    }
    if (!isNlsString(description)) {
        throw new Error(`Property 'description' should be localized.`);
    }
    let result;
    for (const policyType of PolicyTypes) {
        if (result = policyType.from(name, category, minimumVersion, description, moduleName, settingNode)) {
            break;
        }
    }
    if (!result) {
        throw new Error(`Failed to parse policy '${name}'.`);
    }
    return result;
}
function getPolicies(moduleName, node) {
    const query = new Parser.Query(typescript, `
		(
			(call_expression
				function: (member_expression property: (property_identifier) @registerConfigurationFn) (#eq? @registerConfigurationFn registerConfiguration)
				arguments: (arguments	(object	(pair
					key: [(property_identifier)(string)] @propertiesKey (#eq? @propertiesKey properties)
					value: (object (pair
						key: [(property_identifier)(string)]
						value: (object (pair
							key: [(property_identifier)(string)] @policyKey (#eq? @policyKey policy)
							value: (object) @policy
						)) @setting
					))
				)) @configuration)
			)
		)
	`);
    const categories = new Map();
    return query.matches(node).map(m => {
        const configurationNode = m.captures.filter(c => c.name === 'configuration')[0].node;
        const settingNode = m.captures.filter(c => c.name === 'setting')[0].node;
        const policyNode = m.captures.filter(c => c.name === 'policy')[0].node;
        return getPolicy(moduleName, configurationNode, settingNode, policyNode, categories);
    });
}
async function getFiles(root) {
    return new Promise((c, e) => {
        const result = [];
        const rg = (0, child_process_1.spawn)(ripgrep_1.rgPath, ['-l', 'registerConfiguration\\(', '-g', 'src/**/*.ts', '-g', '!src/**/test/**', root]);
        const stream = byline(rg.stdout.setEncoding('utf8'));
        stream.on('data', path => result.push(path));
        stream.on('error', err => e(err));
        stream.on('end', () => c(result));
    });
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
			${versions.map(v => `<string id="Supported_${v.replace(/\./g, '_')}">${appName} &gt;= ${v}</string>`)}
			${categories.map(c => renderADMLString('Category', c.moduleName, c.name, translations))}
			${policies.map(p => p.renderADMLStrings(translations)).flat().join(`\n			`)}
		</stringTable>
		<presentationTable>
			${policies.map(p => p.renderADMLPresentation()).join(`\n			`)}
		</presentationTable>
	</resources>
</policyDefinitionResources>
`;
}
function renderGP(policies, translations) {
    const appName = product.nameLong;
    const regKey = product.win32RegValueName;
    const versions = [...new Set(policies.map(p => p.minimumVersion)).values()].sort();
    const categories = [...new Set(policies.map(p => p.category))];
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
    const res = await (0, node_fetch_1.default)(url);
    if (res.status !== 200) {
        throw new Error(`[${res.status}] Error downloading language pack ${languageId}@${version}`);
    }
    const { contents: result } = await res.json();
    return result;
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
    const res = await (0, node_fetch_1.default)(`${serviceUrl}/extensionquery`, {
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
async function parsePolicies() {
    const parser = new Parser();
    parser.setLanguage(typescript);
    const files = await getFiles(process.cwd());
    const base = path.join(process.cwd(), 'src');
    const policies = [];
    for (const file of files) {
        const moduleName = path.relative(base, file).replace(/\.ts$/i, '').replace(/\\/g, '/');
        const contents = await fs_1.promises.readFile(file, { encoding: 'utf8' });
        const tree = parser.parse(contents);
        policies.push(...getPolicies(moduleName, tree.rootNode));
    }
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
async function main() {
    const [policies, translations] = await Promise.all([parsePolicies(), getTranslations()]);
    const { admx, adml } = await renderGP(policies, translations);
    const root = '.build/policies/win32';
    await fs_1.promises.rm(root, { recursive: true, force: true });
    await fs_1.promises.mkdir(root, { recursive: true });
    await fs_1.promises.writeFile(path.join(root, `${product.win32RegValueName}.admx`), admx.replace(/\r?\n/g, '\n'));
    for (const { languageId, contents } of adml) {
        const languagePath = path.join(root, languageId === 'en-us' ? 'en-us' : Languages[languageId]);
        await fs_1.promises.mkdir(languagePath, { recursive: true });
        await fs_1.promises.writeFile(path.join(languagePath, `${product.win32RegValueName}.adml`), contents.replace(/\r?\n/g, '\n'));
    }
}
if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9saWNpZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwb2xpY2llcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7O0FBRWhHLGlEQUFzQztBQUN0QywyQkFBb0M7QUFDcEMsNkJBQTZCO0FBQzdCLGlDQUFpQztBQUNqQyw2Q0FBeUM7QUFDekMsc0NBQXNDO0FBQ3RDLDJDQUErQjtBQUMvQixNQUFNLEVBQUUsVUFBVSxFQUFFLEdBQUcsT0FBTyxDQUFDLHdCQUF3QixDQUFDLENBQUM7QUFDekQsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLG9CQUFvQixDQUFDLENBQUM7QUFDOUMsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLG9CQUFvQixDQUFDLENBQUM7QUFJbEQsU0FBUyxXQUFXLENBQUMsS0FBcUM7SUFDekQsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLE9BQU8sS0FBSyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQ2xELENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxLQUE2QjtJQUNuRCxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3pDLENBQUM7QUFFRCxTQUFTLGdCQUFnQixDQUFDLEtBQTZCO0lBQ3RELE9BQU8sS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3pDLENBQUM7QUFPRCxJQUFLLFVBRUo7QUFGRCxXQUFLLFVBQVU7SUFDZCx1REFBVSxDQUFBO0FBQ1gsQ0FBQyxFQUZJLFVBQVUsS0FBVixVQUFVLFFBRWQ7QUFVRCxTQUFTLGdCQUFnQixDQUFDLE1BQWMsRUFBRSxVQUFrQixFQUFFLFNBQW9CLEVBQUUsWUFBbUM7SUFDdEgsSUFBSSxLQUF5QixDQUFDO0lBRTlCLElBQUksWUFBWSxFQUFF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