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
function getPolicy(settingNode, policyNode, categories) {
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
    return { policyType: PolicyType.StringEnum, name, minimumVersion, description, type, enum: _enum, enumDescriptions, category };
}
function getPolicies(node) {
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
        return getPolicy(settingNode, policyNode, categories);
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
			<supportedOn ref="SUPPORTED_${policy.minimumVersion.replace('.', '_')}" />
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
    versions = versions.map(v => v.replace('.', '_'));
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
function renderADMLString(policy, nlsString) {
    return `<string id="${policy.name}_${nlsString.nlsKey}">${nlsString.value}</string>`;
}
function pushADMLString(arr, policy, value) {
    if (isNlsString(value)) {
        arr.push(renderADMLString(policy, value));
    }
}
function pushADMLStrings(arr, policy, values) {
    for (const value of values) {
        pushADMLString(arr, policy, value);
    }
}
function renderADMLStrings(policy) {
    const result = [
        `<string id="${policy.name}">${policy.name}</string>`
    ];
    pushADMLString(result, policy, policy.description);
    switch (policy.policyType) {
        case PolicyType.StringEnum:
            pushADMLStrings(result, policy, policy.enumDescriptions);
            break;
        default:
            throw new Error(`Unexpected policy type: ${policy.type}`);
    }
    return result;
}
function renderADMLPresentation(policy) {
    switch (policy.policyType) {
        case PolicyType.StringEnum:
            return `<presentation id="${policy.name}"><dropdownList refId="${policy.name}" /></presentation>`;
        default:
            throw new Error(`Unexpected policy type: ${policy.type}`);
    }
}
function renderADML(appName, versions, categories, policies) {
    return `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources revision="1.0" schemaVersion="1.0">
	<displayName />
	<description />
	<resources>
		<stringTable>
			<string id="Application">${appName}</string>
			${versions.map(v => `<string id="Supported_${v.replace('.', '_')}">${appName} ${v} or later</string>`)}
			${categories.map(c => `<string id="Category_${c.name.nlsKey}">${c.name.value}</string>`)}
			${policies.map(p => renderADMLStrings(p)).flat().join(`\n			`)}
		</stringTable>
		<presentationTable>
			${policies.map(p => renderADMLPresentation(p)).join(`\n			`)}
		</presentationTable>
	</resources>
</policyDefinitionResources>
`;
}
async function renderGP(policies) {
    const product = JSON.parse(await fs_1.promises.readFile('product.json', 'utf-8'));
    const appName = product.nameLong;
    const regKey = product.win32RegValueName;
    const versions = [...new Set(policies.map(p => p.minimumVersion)).values()].sort();
    const categories = [...new Set(policies.map(p => p.category))];
    return {
        admx: renderADMX(regKey, versions, categories, policies),
        adml: renderADML(appName, versions, categories, policies),
    };
}
// ---
async function main() {
    const parser = new Parser();
    parser.setLanguage(typescript);
    const files = await getFiles(process.cwd());
    const policies = [];
    for (const file of files) {
        const contents = await fs_1.promises.readFile(file, { encoding: 'utf8' });
        const tree = parser.parse(contents);
        policies.push(...getPolicies(tree.rootNode));
    }
    const { admx, adml } = await renderGP(policies);
    const root = '.build/policies/win32';
    await fs_1.promises.mkdir(root, { recursive: true });
    await fs_1.promises.writeFile(path.join(root, 'Code.admx'), admx.replace(/\r?\n/g, '\n'));
    await fs_1.promises.writeFile(path.join(root, 'Code.adml'), adml.replace(/\r?\n/g, '\n'));
}
if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
