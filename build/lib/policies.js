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
    const res = await fetch(url);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9saWNpZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwb2xpY2llcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7O0FBRWhHLGlEQUFzQztBQUN0QywyQkFBb0M7QUFDcEMsNkJBQTZCO0FBQzdCLGlDQUFpQztBQUNqQyw2Q0FBeUM7QUFDekMsc0NBQXNDO0FBQ3RDLE1BQU0sRUFBRSxVQUFVLEVBQUUsR0FBRyxPQUFPLENBQUMsd0JBQXdCLENBQUMsQ0FBQztBQUN6RCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUM5QyxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUlsRCxTQUFTLFdBQVcsQ0FBQyxLQUFxQztJQUN6RCxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDbEQsQ0FBQztBQUVELFNBQVMsYUFBYSxDQUFDLEtBQTZCO0lBQ25ELE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDekMsQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMsS0FBNkI7SUFDdEQsT0FBTyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDekMsQ0FBQztBQU9ELElBQUssVUFFSjtBQUZELFdBQUssVUFBVTtJQUNkLHVEQUFVLENBQUE7QUFDWCxDQUFDLEVBRkksVUFBVSxLQUFWLFVBQVUsUUFFZDtBQVVELFNBQVMsZ0JBQWdCLENBQUMsTUFBYyxFQUFFLFVBQWtCLEVBQUUsU0FBb0IsRUFBRSxZQUFtQztJQUN0SCxJQUFJLEtBQXlCLENBQUM7SUFFOUIsSUFBSSxZQUFZLEVBQUUsQ0FBQztRQUNsQixN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