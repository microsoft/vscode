/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import byline from 'byline';
import { rgPath } from '@vscode/ripgrep';
import Parser from 'tree-sitter';
const { typescript } = require('tree-sitter-typescript');
const product = require('../../product.json');
const packageJson = require('../../package.json');

type NlsString = { value: string; nlsKey: string };

function isNlsString(value: string | NlsString | undefined): value is NlsString {
	return value ? typeof value !== 'string' : false;
}

function isStringArray(value: (string | NlsString)[]): value is string[] {
	return !value.some(s => isNlsString(s));
}

function isNlsStringArray(value: (string | NlsString)[]): value is NlsString[] {
	return value.every(s => isNlsString(s));
}

interface Category {
	readonly moduleName: string;
	readonly name: NlsString;
}

enum PolicyType {
	Boolean = 'boolean',
	Number = 'number',
	Object = 'object',
	String = 'string',
	StringEnum = 'stringEnum',
}

interface Policy {
	readonly name: string;
	readonly type: PolicyType;
	readonly category: Category;
	readonly minimumVersion: string;
	renderADMX(regKey: string): string[];
	renderADMLStrings(translations?: LanguageTranslations): string[];
	renderADMLPresentation(): string;
	renderProfile(): string[];
	// https://github.com/ProfileManifests/ProfileManifests/wiki/Manifest-Format
	renderProfileManifest(translations?: LanguageTranslations): string;
}

function renderADMLString(prefix: string, moduleName: string, nlsString: NlsString, translations?: LanguageTranslations): string {
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

function renderProfileString(_prefix: string, moduleName: string, nlsString: NlsString, translations?: LanguageTranslations): string {
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

abstract class BasePolicy implements Policy {
	constructor(
		readonly type: PolicyType,
		readonly name: string,
		readonly category: Category,
		readonly minimumVersion: string,
		protected description: NlsString,
		protected moduleName: string,
	) { }

	protected renderADMLString(nlsString: NlsString, translations?: LanguageTranslations): string {
		return renderADMLString(this.name, this.moduleName, nlsString, translations);
	}

	renderADMX(regKey: string) {
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

	protected abstract renderADMXElements(): string[];

	renderADMLStrings(translations?: LanguageTranslations) {
		return [
			`<string id="${this.name}">${this.name}</string>`,
			this.renderADMLString(this.description, translations)
		];
	}

	renderADMLPresentation(): string {
		return `<presentation id="${this.name}">${this.renderADMLPresentationContents()}</presentation>`;
	}

	protected abstract renderADMLPresentationContents(): string;

	renderProfile() {
		return [`<key>${this.name}</key>`, this.renderProfileValue()];
	}

	renderProfileManifest(translations?: LanguageTranslations): string {
		return `<dict>
${this.renderProfileManifestValue(translations)}
</dict>`;
	}

	abstract renderProfileValue(): string;
	abstract renderProfileManifestValue(translations?: LanguageTranslations): string;
}

class BooleanPolicy extends BasePolicy {

	static from(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
		settingNode: Parser.SyntaxNode
	): BooleanPolicy | undefined {
		const type = getStringProperty(moduleName, settingNode, 'type');

		if (type !== 'boolean') {
			return undefined;
		}

		return new BooleanPolicy(name, category, minimumVersion, description, moduleName);
	}

	private constructor(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
	) {
		super(PolicyType.Boolean, name, category, minimumVersion, description, moduleName);
	}

	protected renderADMXElements(): string[] {
		return [
			`<boolean id="${this.name}" valueName="${this.name}">`,
			`	<trueValue><decimal value="1" /></trueValue><falseValue><decimal value="0" /></falseValue>`,
			`</boolean>`
		];
	}

	renderADMLPresentationContents() {
		return `<checkBox refId="${this.name}">${this.name}</checkBox>`;
	}

	renderProfileValue(): string {
		return `<false/>`;
	}

	renderProfileManifestValue(translations?: LanguageTranslations): string {
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

class ParseError extends Error {
	constructor(message: string, moduleName: string, node: Parser.SyntaxNode) {
		super(`${message}. ${moduleName}.ts:${node.startPosition.row + 1}`);
	}
}

class NumberPolicy extends BasePolicy {

	static from(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
		settingNode: Parser.SyntaxNode
	): NumberPolicy | undefined {
		const type = getStringProperty(moduleName, settingNode, 'type');

		if (type !== 'number') {
			return undefined;
		}

		const defaultValue = getNumberProperty(moduleName, settingNode, 'default');

		if (typeof defaultValue === 'undefined') {
			throw new ParseError(`Missing required 'default' property.`, moduleName, settingNode);
		}

		return new NumberPolicy(name, category, minimumVersion, description, moduleName, defaultValue);
	}

	private constructor(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
		protected readonly defaultValue: number,
	) {
		super(PolicyType.StringEnum, name, category, minimumVersion, description, moduleName);
	}

	protected renderADMXElements(): string[] {
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

	renderProfileManifestValue(translations?: LanguageTranslations) {
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

	static from(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
		settingNode: Parser.SyntaxNode
	): StringPolicy | undefined {
		const type = getStringProperty(moduleName, settingNode, 'type');

		if (type !== 'string') {
			return undefined;
		}

		return new StringPolicy(name, category, minimumVersion, description, moduleName);
	}

	private constructor(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
	) {
		super(PolicyType.String, name, category, minimumVersion, description, moduleName);
	}

	protected renderADMXElements(): string[] {
		return [`<text id="${this.name}" valueName="${this.name}" required="true" />`];
	}

	renderADMLPresentationContents() {
		return `<textBox refId="${this.name}"><label>${this.name}:</label></textBox>`;
	}

	renderProfileValue(): string {
		return `<string></string>`;
	}

	renderProfileManifestValue(translations?: LanguageTranslations): string {
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

	static from(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
		settingNode: Parser.SyntaxNode
	): ObjectPolicy | undefined {
		const type = getStringProperty(moduleName, settingNode, 'type');

		if (type !== 'object' && type !== 'array') {
			return undefined;
		}

		return new ObjectPolicy(name, category, minimumVersion, description, moduleName);
	}

	private constructor(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
	) {
		super(PolicyType.Object, name, category, minimumVersion, description, moduleName);
	}

	protected renderADMXElements(): string[] {
		return [`<multiText id="${this.name}" valueName="${this.name}" required="true" />`];
	}

	renderADMLPresentationContents() {
		return `<multiTextBox refId="${this.name}" />`;
	}

	renderProfileValue(): string {
		return `<string></string>`;
	}

	renderProfileManifestValue(translations?: LanguageTranslations): string {
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

	static from(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
		settingNode: Parser.SyntaxNode
	): StringEnumPolicy | undefined {
		const type = getStringProperty(moduleName, settingNode, 'type');

		if (type !== 'string') {
			return undefined;
		}

		const enum_ = getStringArrayProperty(moduleName, settingNode, 'enum');

		if (!enum_) {
			return undefined;
		}

		if (!isStringArray(enum_)) {
			throw new ParseError(`Property 'enum' should not be localized.`, moduleName, settingNode);
		}

		const enumDescriptions = getStringArrayProperty(moduleName, settingNode, 'enumDescriptions');

		if (!enumDescriptions) {
			throw new ParseError(`Missing required 'enumDescriptions' property.`, moduleName, settingNode);
		} else if (!isNlsStringArray(enumDescriptions)) {
			throw new ParseError(`Property 'enumDescriptions' should be localized.`, moduleName, settingNode);
		}

		return new StringEnumPolicy(name, category, minimumVersion, description, moduleName, enum_, enumDescriptions);
	}

	private constructor(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
		protected enum_: string[],
		protected enumDescriptions: NlsString[],
	) {
		super(PolicyType.StringEnum, name, category, minimumVersion, description, moduleName);
	}

	protected renderADMXElements(): string[] {
		return [
			`<enum id="${this.name}" valueName="${this.name}">`,
			...this.enum_.map((value, index) => `	<item displayName="$(string.${this.name}_${this.enumDescriptions[index].nlsKey})"><value><string>${value}</string></value></item>`),
			`</enum>`
		];
	}

	renderADMLStrings(translations?: LanguageTranslations) {
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

	renderProfileManifestValue(translations?: LanguageTranslations): string {
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

interface QType<T> {
	Q: string;
	value(matches: Parser.QueryMatch[]): T | undefined;
}

const NumberQ: QType<number> = {
	Q: `(number) @value`,

	value(matches: Parser.QueryMatch[]): number | undefined {
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

const StringQ: QType<string | NlsString> = {
	Q: `[
		(string (string_fragment) @value)
		(call_expression
			function: [
				(identifier) @localizeFn (#eq? @localizeFn localize)
				(member_expression
					object: (identifier) @nlsObj (#eq? @nlsObj nls)
					property: (property_identifier) @localizeFn (#eq? @localizeFn localize)
				)
			]
			arguments: (arguments (string (string_fragment) @nlsKey) (string (string_fragment) @value))
		)
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
		if (matches.length === 0) {
			return undefined;
		}

		return matches.map(match => {
			return StringQ.value([match]) as string | NlsString;
		});
	}
};

function getProperty<T>(qtype: QType<T>, moduleName: string, node: Parser.SyntaxNode, key: string): T | undefined {
	const query = new Parser.Query(
		typescript,
		`(
			(pair
				key: [(property_identifier)(string)] @key
				value: ${qtype.Q}
			)
			(#any-of? @key "${key}" "'${key}'")
		)`
	);

	try {
		const matches = query.matches(node).filter(m => m.captures[0].node.parent?.parent === node);
		return qtype.value(matches);
	} catch (e) {
		throw new ParseError(e.message, moduleName, node);
	}
}

function getNumberProperty(moduleName: string, node: Parser.SyntaxNode, key: string): number | undefined {
	return getProperty(NumberQ, moduleName, node, key);
}

function getStringProperty(moduleName: string, node: Parser.SyntaxNode, key: string): string | NlsString | undefined {
	return getProperty(StringQ, moduleName, node, key);
}

function getStringArrayProperty(moduleName: string, node: Parser.SyntaxNode, key: string): (string | NlsString)[] | undefined {
	return getProperty(StringArrayQ, moduleName, node, key);
}

// TODO: add more policy types
const PolicyTypes = [
	BooleanPolicy,
	NumberPolicy,
	StringEnumPolicy,
	StringPolicy,
	ObjectPolicy
];

function getPolicy(
	moduleName: string,
	configurationNode: Parser.SyntaxNode,
	settingNode: Parser.SyntaxNode,
	policyNode: Parser.SyntaxNode,
	categories: Map<string, Category>
): Policy {
	const name = getStringProperty(moduleName, policyNode, 'name');

	if (!name) {
		throw new ParseError(`Missing required 'name' property`, moduleName, policyNode);
	} else if (isNlsString(name)) {
		throw new ParseError(`Property 'name' should be a literal string`, moduleName, policyNode);
	}

	const categoryName = getStringProperty(moduleName, configurationNode, 'title');

	if (!categoryName) {
		throw new ParseError(`Missing required 'title' property`, moduleName, configurationNode);
	} else if (!isNlsString(categoryName)) {
		throw new ParseError(`Property 'title' should be localized`, moduleName, configurationNode);
	}

	const categoryKey = `${categoryName.nlsKey}:${categoryName.value}`;
	let category = categories.get(categoryKey);

	if (!category) {
		category = { moduleName, name: categoryName };
		categories.set(categoryKey, category);
	}

	const minimumVersion = getStringProperty(moduleName, policyNode, 'minimumVersion');

	if (!minimumVersion) {
		throw new ParseError(`Missing required 'minimumVersion' property.`, moduleName, policyNode);
	} else if (isNlsString(minimumVersion)) {
		throw new ParseError(`Property 'minimumVersion' should be a literal string.`, moduleName, policyNode);
	}

	const description = getStringProperty(moduleName, policyNode, 'description') ?? getStringProperty(moduleName, settingNode, 'description');

	if (!description) {
		throw new ParseError(`Missing required 'description' property.`, moduleName, settingNode);
	} if (!isNlsString(description)) {
		throw new ParseError(`Property 'description' should be localized.`, moduleName, settingNode);
	}

	let result: Policy | undefined;

	for (const policyType of PolicyTypes) {
		if (result = policyType.from(name, category, minimumVersion, description, moduleName, settingNode)) {
			break;
		}
	}

	if (!result) {
		throw new ParseError(`Failed to parse policy '${name}'.`, moduleName, settingNode);
	}

	return result;
}

function getPolicies(moduleName: string, node: Parser.SyntaxNode): Policy[] {
	const query = new Parser.Query(typescript, `
		(
			(call_expression
				function: (member_expression property: (property_identifier) @registerConfigurationFn) (#eq? @registerConfigurationFn registerConfiguration)
				arguments: (arguments	(object	(pair
					key: [(property_identifier)(string)] @propertiesKey (#any-of? @propertiesKey "properties" "'properties'")
					value: (object (pair
						key: [(property_identifier)(string)(computed_property_name)]
						value: (object (pair
							key: [(property_identifier)(string)] @policyKey (#any-of? @policyKey "policy" "'policy'")
							value: (object) @policy
						)) @setting
					))
				)) @configuration)
			)
		)
	`);

	const categories = new Map<string, Category>();

	return query.matches(node).map(m => {
		const configurationNode = m.captures.filter(c => c.name === 'configuration')[0].node;
		const settingNode = m.captures.filter(c => c.name === 'setting')[0].node;
		const policyNode = m.captures.filter(c => c.name === 'policy')[0].node;
		return getPolicy(moduleName, configurationNode, settingNode, policyNode, categories);
	});
}

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

function renderADMX(regKey: string, versions: string[], categories: Category[], policies: Policy[]) {
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

function renderADML(appName: string, versions: string[], categories: Category[], policies: Policy[], translations?: LanguageTranslations) {
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

function renderProfileManifest(appName: string, bundleIdentifier: string, _versions: string[], _categories: Category[], policies: Policy[], translations?: LanguageTranslations) {

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

function renderMacOSPolicy(policies: Policy[], translations: Translations) {
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

function renderGP(policies: Policy[], translations: Translations) {
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

type LanguageTranslations = { [moduleName: string]: { [nlsKey: string]: string } };
type Translations = { languageId: string; languageTranslations: LanguageTranslations }[];

type Version = [number, number, number];

async function getSpecificNLS(resourceUrlTemplate: string, languageId: string, version: Version) {
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

function parseVersion(version: string): Version {
	const [, major, minor, patch] = /^(\d+)\.(\d+)\.(\d+)/.exec(version)!;
	return [parseInt(major), parseInt(minor), parseInt(patch)];
}

function compareVersions(a: Version, b: Version): number {
	if (a[0] !== b[0]) { return a[0] - b[0]; }
	if (a[1] !== b[1]) { return a[1] - b[1]; }
	return a[2] - b[2];
}

async function queryVersions(serviceUrl: string, languageId: string): Promise<Version[]> {
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
	return result.results[0].extensions[0].versions.map(v => parseVersion(v.version)).sort(compareVersions);
}

async function getNLS(extensionGalleryServiceUrl: string, resourceUrlTemplate: string, languageId: string, version: Version) {
	const versions = await queryVersions(extensionGalleryServiceUrl, languageId);
	const nextMinor: Version = [version[0], version[1] + 1, 0];
	const compatibleVersions = versions.filter(v => compareVersions(v, nextMinor) < 0);
	const latestCompatibleVersion = compatibleVersions.at(-1)!; // order is newest to oldest

	if (!latestCompatibleVersion) {
		throw new Error(`No compatible language pack found for ${languageId} for version ${version}`);
	}

	return await getSpecificNLS(resourceUrlTemplate, languageId, latestCompatibleVersion);
}

async function parsePolicies(): Promise<Policy[]> {
	const parser = new Parser();
	parser.setLanguage(typescript);

	const files = await getFiles(process.cwd());
	const base = path.join(process.cwd(), 'src');
	const policies = [];

	for (const file of files) {
		const moduleName = path.relative(base, file).replace(/\.ts$/i, '').replace(/\\/g, '/');
		const contents = await fs.readFile(file, { encoding: 'utf8' });
		const tree = parser.parse(contents);
		policies.push(...getPolicies(moduleName, tree.rootNode));
	}

	return policies;
}

async function getTranslations(): Promise<Translations> {
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

	return await Promise.all(languageIds.map(
		languageId => getNLS(extensionGalleryServiceUrl, resourceUrlTemplate, languageId, version)
			.then(languageTranslations => ({ languageId, languageTranslations }))
	));
}

async function windowsMain(policies: Policy[], translations: Translations) {
	const root = '.build/policies/win32';
	const { admx, adml } = await renderGP(policies, translations);

	await fs.rm(root, { recursive: true, force: true });
	await fs.mkdir(root, { recursive: true });

	await fs.writeFile(path.join(root, `${product.win32RegValueName}.admx`), admx.replace(/\r?\n/g, '\n'));

	for (const { languageId, contents } of adml) {
		const languagePath = path.join(root, languageId === 'en-us' ? 'en-us' : Languages[languageId as keyof typeof Languages]);
		await fs.mkdir(languagePath, { recursive: true });
		await fs.writeFile(path.join(languagePath, `${product.win32RegValueName}.adml`), contents.replace(/\r?\n/g, '\n'));
	}
}

async function darwinMain(policies: Policy[], translations: Translations) {
	const bundleIdentifier = product.darwinBundleIdentifier;
	if (!bundleIdentifier || !product.darwinProfilePayloadUUID || !product.darwinProfileUUID) {
		throw new Error(`Missing required product information.`);
	}
	const root = '.build/policies/darwin';
	const { profile, manifests } = await renderMacOSPolicy(policies, translations);

	await fs.rm(root, { recursive: true, force: true });
	await fs.mkdir(root, { recursive: true });
	await fs.writeFile(path.join(root, `${bundleIdentifier}.mobileconfig`), profile.replace(/\r?\n/g, '\n'));

	for (const { languageId, contents } of manifests) {
		const languagePath = path.join(root, languageId === 'en-us' ? 'en-us' : Languages[languageId as keyof typeof Languages]);
		await fs.mkdir(languagePath, { recursive: true });
		await fs.writeFile(path.join(languagePath, `${bundleIdentifier}.plist`), contents.replace(/\r?\n/g, '\n'));
	}
}

async function main() {
	const [policies, translations] = await Promise.all([parsePolicies(), getTranslations()]);
	const platform = process.argv[2];

	if (platform === 'darwin') {
		await darwinMain(policies, translations);
	} else if (platform === 'win32') {
		await windowsMain(policies, translations);
	} else {
		console.error(`Usage: node build/lib/policies <darwin|win32>`);
		process.exit(1);
	}
}

if (require.main === module) {
	main().catch(err => {
		if (err instanceof ParseError) {
			console.error(`Parse Error:`, err.message);
		} else {
			console.error(err);
		}
		process.exit(1);
	});
}
