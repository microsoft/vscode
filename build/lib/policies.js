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
function getStringProperty(node, key) {
    return getProperty(StringQ, node, key);
}
function getStringArrayProperty(node, key) {
    return getProperty(StringArrayQ, node, key);
}
// ---
function getPolicy(moduleName, settingNode, policyNode, categories) {
    const name = getStringProperty(policyNode, 'name');
    if (!name) {
        throw new Error(`Missing required 'name' property.`);
    }
    if (isNlsString(name)) {
        throw new Error(`Property 'name' should be a literal string.`);
    }
    const minimumVersion = getStringProperty(policyNode, 'minimumVersion');
    if (!minimumVersion) {
        throw new Error(`Missing required 'minimumVersion' property.`);
    }
    if (isNlsString(minimumVersion)) {
        throw new Error(`Property 'minimumVersion' should be a literal string.`);
    }
    const description = getStringProperty(settingNode, 'description');
    if (!description) {
        throw new Error(`Missing required 'description' property.`);
    }
    if (!isNlsString(description)) {
        throw new Error(`Property 'description' should be localized.`);
    }
    const type = getStringProperty(settingNode, 'type');
    if (!type) {
        throw new Error(`Missing required 'type' property.`);
    }
    if (type !== 'string') {
        throw new Error(`TODO`);
    }
    const _enum = getStringArrayProperty(settingNode, 'enum');
    if (!_enum) {
        throw new Error(`TODO`);
    }
    if (!isStringArray(_enum)) {
        throw new Error(`TODO`);
    }
    const enumDescriptions = getStringArrayProperty(settingNode, 'enumDescriptions');
    if (!enumDescriptions) {
        throw new Error(`TODO`);
    }
    if (!isNlsStringArray(enumDescriptions)) {
        throw new Error(`Property 'enumDescriptions' should be localized.`);
    }
    const categoryName = getStringProperty(policyNode, 'category');
    if (!categoryName) {
        throw new Error(`Missing required 'category' property.`);
    }
    else if (!isNlsString(categoryName)) {
        throw new Error(`Property 'category' should be localized.`);
    }
    const categoryKey = `${categoryName.nlsKey}:${categoryName.value}`;
    let category = categories.get(categoryKey);
    if (!category) {
        category = { name: categoryName };
        categories.set(categoryKey, category);
    }
    return { policyType: PolicyType.StringEnum, name, minimumVersion, description, type, moduleName, enum: _enum, enumDescriptions, category };
}
function getPolicies(moduleName, node) {
    const query = new Parser.Query(typescript, `
		(
			(call_expression
				function: (member_expression object: (identifier) property: (property_identifier) @registerConfigurationFn) (#eq? @registerConfigurationFn registerConfiguration)
				arguments: (arguments	(object	(pair
					key: [(property_identifier)(string)] @propertiesKey (#eq? @propertiesKey properties)
					value: (object (pair
						key: [(property_identifier)(string)]
						value: (object (pair
							key: [(property_identifier)(string)] @policyKey (#eq? @policyKey policy)
							value: (object) @policy
						))
					)) @setting
				)))
			)
		)
	`);
    const categories = new Map();
    return query.matches(node).map(m => {
        const settingNode = m.captures.filter(c => c.name === 'setting')[0].node;
        const policyNode = m.captures.filter(c => c.name === 'policy')[0].node;
        return getPolicy(moduleName, settingNode, policyNode, categories);
    });
}
// ---
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
// ---
function renderADMXPolicy(regKey, policy) {
    switch (policy.policyType) {
        case PolicyType.StringEnum:
            return `<policy name="${policy.name}" class="Both" displayName="$(string.${policy.name})" explainText="$(string.${policy.name}_${policy.description.nlsKey})" key="Software\\Policies\\Microsoft\\${regKey}" presentation="$(presentation.${policy.name})">
			<parentCategory ref="${policy.category.name.nlsKey}" />
			<supportedOn ref="SUPPORTED_${policy.minimumVersion.replace(/\./g, '_')}" />
			<elements>
				<enum id="${policy.name}" valueName="${policy.name}">
					${policy.enum.map((value, index) => `<item displayName="$(string.${policy.name}_${policy.enumDescriptions[index].nlsKey})"><value><string>${value}</string></value></item>`).join(`\n					`)}
				</enum>
			</elements>
		</policy>`;
        default:
            throw new Error(`Unexpected policy type: ${policy.type}`);
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
		${policies.map(p => renderADMXPolicy(regKey, p)).join(`\n		`)}
	</policies>
</policyDefinitions>
`;
}
function renderADMLString(policy, nlsString, translations) {
    let value;
    if (translations) {
        const moduleTranslations = translations[policy.moduleName];
        if (moduleTranslations) {
            value = moduleTranslations[nlsString.nlsKey];
        }
    }
    if (!value) {
        value = nlsString.value;
    }
    return `<string id="${policy.name}_${nlsString.nlsKey}">${value}</string>`;
}
function pushADMLString(arr, policy, value, translations) {
    if (isNlsString(value)) {
        arr.push(renderADMLString(policy, value, translations));
    }
}
function pushADMLStrings(arr, policy, values, translations) {
    for (const value of values) {
        pushADMLString(arr, policy, value, translations);
    }
}
function renderADMLStrings(policy, translations) {
    const result = [
        `<string id="${policy.name}">${policy.name}</string>`
    ];
    pushADMLString(result, policy, policy.description, translations);
    switch (policy.policyType) {
        case PolicyType.StringEnum:
            pushADMLStrings(result, policy, policy.enumDescriptions, translations);
            break;
        default:
            throw new Error(`Unexpected policy type: ${policy.type}`);
    }
    return result;
}
function renderADMLPresentation(policy, _translations) {
    switch (policy.policyType) {
        case PolicyType.StringEnum:
            return `<presentation id="${policy.name}"><dropdownList refId="${policy.name}" /></presentation>`;
        default:
            throw new Error(`Unexpected policy type: ${policy.type}`);
    }
}
function renderADML(appName, versions, categories, policies, translations) {
    return `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources revision="1.0" schemaVersion="1.0">
	<displayName />
	<description />
	<resources>
		<stringTable>
			<string id="Application">${appName}</string>
			${versions.map(v => `<string id="Supported_${v.replace(/\./g, '_')}">${appName} ${v} or later</string>`)}
			${categories.map(c => `<string id="Category_${c.name.nlsKey}">${c.name.value}</string>`)}
			${policies.map(p => renderADMLStrings(p, translations)).flat().join(`\n			`)}
		</stringTable>
		<presentationTable>
			${policies.map(p => renderADMLPresentation(p, translations)).join(`\n			`)}
		</presentationTable>
	</resources>
</policyDefinitionResources>
`;
}
async function renderGP(policies, translations) {
    const product = JSON.parse(await fs_1.promises.readFile('product.json', 'utf-8'));
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
// ---
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
async function getLatestStableVersion() {
    const res = await (0, node_fetch_1.default)(`https://update.code.visualstudio.com/api/update/darwin/stable/latest`);
    const { name: version } = await res.json();
    return version;
}
async function getNLS(languageId, version) {
    const res = await (0, node_fetch_1.default)(`https://ms-ceintl.vscode-unpkg.net/ms-ceintl/vscode-language-pack-${languageId}/${version}/extension/translations/main.i18n.json`);
    const { contents: result } = await res.json();
    return result;
}
// ---
async function main() {
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
    const version = await getLatestStableVersion();
    const languageIds = Object.keys(Languages);
    const translations = await Promise.all(languageIds.map(languageId => getNLS(languageId, version).then(languageTranslations => ({ languageId, languageTranslations }))));
    const { admx, adml } = await renderGP(policies, translations);
    const root = '.build/policies/win32';
    await fs_1.promises.rm(root, { recursive: true, force: true });
    await fs_1.promises.mkdir(root, { recursive: true });
    await fs_1.promises.writeFile(path.join(root, 'Code.admx'), admx.replace(/\r?\n/g, '\n'));
    for (const { languageId, contents } of adml) {
        const languagePath = languageId === 'en-us' ? 'en-us' : path.join(root, Languages[languageId]);
        await fs_1.promises.mkdir(languagePath, { recursive: true });
        await fs_1.promises.writeFile(path.join(languagePath, 'Code.adml'), contents.replace(/\r?\n/g, '\n'));
    }
}
if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
