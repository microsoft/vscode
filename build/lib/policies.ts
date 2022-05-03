/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { EOL } from 'os';
import * as byline from 'byline';
import { rgPath } from '@vscode/ripgrep';
import * as Parser from 'tree-sitter';
const { typescript } = require('tree-sitter-typescript');

interface NlsString {
	readonly value: string;
	readonly nlsKey: string;
}

function isNlsString(value: string | NlsString | undefined): value is NlsString {
	return value ? typeof value !== 'string' : false;
}

function isStringArray(value: (string | NlsString)[]): value is string[] {
	return !value.some(s => isNlsString(s));
}

enum PolicyType {
	StringEnum
}

interface BasePolicy {
	readonly policyType: PolicyType;
	readonly name: string;
	readonly minimumVersion: string;
	readonly description: string | NlsString;
	readonly category?: string | NlsString;
}

interface StringEnumPolicy extends BasePolicy {
	readonly policyType: PolicyType.StringEnum;
	readonly type: 'string';
	readonly enum: string[];
	readonly enumDescriptions: (string | NlsString)[];
}

type Policy = StringEnumPolicy;

// ---

interface QType<T> {
	Q: string;
	value(matches: Parser.QueryMatch[]): T | undefined;
}

const StringQ: QType<string | NlsString> = {
	Q: `[
		(string (string_fragment) @value)
		(call_expression function: (identifier) @localizeFn arguments: (arguments (string (string_fragment) @nlsKey) (string (string_fragment) @value)) (#eq? @localizeFn localize))
	]`,

	value(matches: Parser.QueryMatch[]): string | NlsString | undefined {
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
		} else {
			return value;
		}
	}
};

const StringArrayQ: QType<(string | NlsString)[]> = {
	Q: `(array ${StringQ.Q})`,

	value(matches: Parser.QueryMatch[]): (string | NlsString)[] | undefined {
		return matches.map(match => {
			return StringQ.value([match]) as string | NlsString;
		});
	}
};

function getProperty<T>(qtype: QType<T>, node: Parser.SyntaxNode, key: string): T | undefined {
	const query = new Parser.Query(
		typescript,
		`(
			(pair
				key: [(property_identifier)(string)] @key
				value: ${qtype.Q}
			)
			(#eq? @key ${key})
		)`
	);

	return qtype.value(query.matches(node));
}

function getStringProperty(node: Parser.SyntaxNode, key: string): string | NlsString | undefined {
	return getProperty(StringQ, node, key);
}

function getStringArrayProperty(node: Parser.SyntaxNode, key: string): (string | NlsString)[] | undefined {
	return getProperty(StringArrayQ, node, key);
}

// ---

function getPolicy(settingNode: Parser.SyntaxNode, policyNode: Parser.SyntaxNode): Policy {
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
	} else {
		return { policyType: PolicyType.StringEnum, name, minimumVersion, description, type, enum: _enum, enumDescriptions };
	}
}

function getPolicies(node: Parser.SyntaxNode): Policy[] {
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

async function getFiles(root: string): Promise<string[]> {
	return new Promise((c, e) => {
		const result: string[] = [];
		const rg = spawn(rgPath, ['-l', 'registerConfiguration\\(', '-g', 'src/**/*.ts', '-g', '!src/**/test/**', root]);
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

function renderADMLString(policy: Policy, nlsString: NlsString): string {
	return `<string id="${policy.name}_${nlsString.nlsKey}">${nlsString.value}</string>`;
}

function pushADMLString(arr: string[], policy: Policy, value: string | NlsString | undefined): void {
	if (isNlsString(value)) {
		arr.push(renderADMLString(policy, value));
	}
}

function pushADMLStrings(arr: string[], policy: Policy, values: (string | NlsString)[]): void {
	for (const value of values) {
		pushADMLString(arr, policy, value);
	}
}

function renderADMLStrings(policy: Policy): string[] {
	const result: string[] = [];

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

function renderADMLPresentation(policy: Policy): string {
	switch (policy.policyType) {
		case PolicyType.StringEnum:
			return `<presentation id="${policy.name}"><dropdownList refId="${policy.name}" /></presentation>`;
		default:
			throw new Error(`Unexpected policy type: ${policy.type}`);
	}
}

async function renderADML(policies: Policy[]) {
	const versions = [...new Set(policies.map(p => p.minimumVersion)).values()].sort();
	const app = JSON.parse(await fs.readFile('product.json', 'utf-8')).nameLong;

	return `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources revision="1.0" schemaVersion="1.0">
	<displayName />
	<description />
	<resources>
		<stringTable>
			<string id="Application">${app}</string>
			${versions.map(v => `<string id="Supported_${v.replace('.', '_')}">${app} ${v} or later</string>`)}
			${policies.map(p => renderADMLStrings(p)).flat().join(`${EOL}			`)}
			</stringTable>
			<presentationTable>
			${policies.map(p => renderADMLPresentation(p)).join(`${EOL}			`)}
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
		const contents = await fs.readFile(file, { encoding: 'utf8' });
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
