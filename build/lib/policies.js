"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = require("os");
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
function getPolicy(settingNode, policyNode) {
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
    const category = getStringProperty(policyNode, 'category');
    if (category) {
        return { policyType: PolicyType.StringEnum, name, minimumVersion, description, type, enum: _enum, enumDescriptions, category };
    }
    else {
        return { policyType: PolicyType.StringEnum, name, minimumVersion, description, type, enum: _enum, enumDescriptions };
    }
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
    return query.matches(node).map(m => {
        const settingNode = m.captures.filter(c => c.name === 'setting')[0].node;
        const policyNode = m.captures.filter(c => c.name === 'policy')[0].node;
        return getPolicy(settingNode, policyNode);
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
// const admxTemplate = `<?xml version="1.0" encoding="utf-8"?>
// <policyDefinitions revision="1.1" schemaVersion="1.0">
//   <policyNamespaces>
//     <target prefix="CodeOSS" namespace="Microsoft.Policies.CodeOSS" />
//   </policyNamespaces>
//   <resources minRequiredRevision="1.0" />
//   <supportedOn>
//     <definitions>
//       <definition name="SUPPORTED_1_67" displayName="$(string.SUPPORTED_1_67)" />
//     </definitions>
//   </supportedOn>
//   <categories>
//     <category displayName="$(string.Application)" name="Application" />
//     <category displayName="$(string.Update_group)" name="Update">
//       <parentCategory ref="Application" />
//     </category>
//   </categories>
//   <policies>
//     <policy name="UpdateMode" class="Both" displayName="$(string.UpdateMode)" explainText="$(string.UpdateMode_Explain)" key="Software\Policies\Microsoft\CodeOSS" presentation="$(presentation.UpdateMode)">
//       <parentCategory ref="Update" />
//       <supportedOn ref="SUPPORTED_1_67" />
//       <elements>
//         <enum id="UpdateMode" valueName="UpdateMode">
//           <item displayName="$(string.UpdateMode_None)">
//             <value>
//               <string>none</string>
//             </value>
//           </item>
//           <item displayName="$(string.UpdateMode_Manual)">
//             <value>
//               <string>manual</string>
//             </value>
//           </item>
//           <item displayName="$(string.UpdateMode_Start)">
//             <value>
//               <string>start</string>
//             </value>
//           </item>
//           <item displayName="$(string.UpdateMode_Default)">
//             <value>
//               <string>default</string>
//             </value>
//           </item>
//         </enum>
//       </elements>
//     </policy>
//   </policies>
// </policyDefinitions>
// `;
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
    const result = [];
    pushADMLString(result, policy, policy.category);
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
async function renderADML(policies) {
    const versions = [...new Set(policies.map(p => p.minimumVersion)).values()].sort();
    const app = JSON.parse(await fs_1.promises.readFile('product.json', 'utf-8')).nameLong;
    return `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources revision="1.0" schemaVersion="1.0">
	<displayName />
	<description />
	<resources>
		<stringTable>
			<string id="Application">${app}</string>
			${versions.map(v => `<string id="Supported_${v.replace('.', '_')}">${app} ${v} or later</string>`)}
			${policies.map(p => renderADMLStrings(p)).flat().join(`${os_1.EOL}			`)}
			</stringTable>
			<presentationTable>
			${policies.map(p => renderADMLPresentation(p)).join(`${os_1.EOL}			`)}
		</presentationTable>
	</resources>
</policyDefinitionResources>
`;
}
// function renderGP(policies: Policy[]): { admx: string; adml: string } {
// }
// ---
async function main() {
    const parser = new Parser();
    parser.setLanguage(typescript);
    const files = await getFiles(process.cwd());
    const policies = [];
    for (const file of files) {
        const contents = await fs_1.promises.readFile(file, { encoding: 'utf8' });
        const tree = parser.parse(contents);
        // for (const policy of getPolicies(tree.rootNode)) {
        // 	console.log(policy);
        // }
        policies.push(...getPolicies(tree.rootNode));
    }
    console.log(await renderADML(policies));
}
if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
