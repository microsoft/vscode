/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as byline from 'byline';
import { rgPath } from '@vscode/ripgrep';
import * as Parser from 'tree-sitter';
import fetch from 'node-fetch';
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
	StringEnum
}

interface Policy {
	readonly category: Category;
	readonly minimumVersion: string;
	renderADMX(regKey: string): string[];
	renderADMLStrings(translations?: LanguageTranslations): string[];
	renderADMLPresentation(): string;
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

	return `<string id="${prefix}_${nlsString.nlsKey}">${value}</string>`;
}

abstract class BasePolicy implements Policy {
	constructor(
		protected policyType: PolicyType,
		protected name: string,
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
			`<policy name="${this.name}" class="Both" displayName="$(string.${this.name})" explainText="$(string.${this.name}_${this.description.nlsKey})" key="Software\\Policies\\Microsoft\\${regKey}" presentation="$(presentation.${this.name})">`,
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
		const type = getStringProperty(settingNode, 'type');

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
		super(PolicyType.StringEnum, name, category, minimumVersion, description, moduleName);
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
}

class IntPolicy extends BasePolicy {

	static from(
		name: string,
		category: Category,
		minimumVersion: string,
		description: NlsString,
		moduleName: string,
		settingNode: Parser.SyntaxNode
	): IntPolicy | undefined {
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
		const type = getStringProperty(settingNode, 'type');

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
		super(PolicyType.StringEnum, name, category, minimumVersion, description, moduleName);
	}

	protected renderADMXElements(): string[] {
		return [`<text id="${this.name}" valueName="${this.name}" required="true" />`];
	}

	renderADMLPresentationContents() {
		return `<textBox refId="${this.name}"><label>${this.name}:</label></textBox>`;
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
		} else if (!isNlsStringArray(enumDescriptions)) {
			throw new Error(`Property 'enumDescriptions' should be localized.`);
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
}

interface QType<T> {
	Q: string;
	value(matches: Parser.QueryMatch[]): T | undefined;
}

const IntQ: QType<number> = {
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
		if (matches.length === 0) {
			return undefined;
		}

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

function getIntProperty(node: Parser.SyntaxNode, key: string): number | undefined {
	return getProperty(IntQ, node, key);
}

function getStringProperty(node: Parser.SyntaxNode, key: string): string | NlsString | undefined {
	return getProperty(StringQ, node, key);
}

function getStringArrayProperty(node: Parser.SyntaxNode, key: string): (string | NlsString)[] | undefined {
	return getProperty(StringArrayQ, node, key);
}

// TODO: add more policy types
const PolicyTypes = [
	BooleanPolicy,
	IntPolicy,
	StringEnumPolicy,
	StringPolicy,
];

function getPolicy(
	moduleName: string,
	configurationNode: Parser.SyntaxNode,
	settingNode: Parser.SyntaxNode,
	policyNode: Parser.SyntaxNode,
	categories: Map<string, Category>
): Policy {
	const name = getStringProperty(policyNode, 'name');

	if (!name) {
		throw new Error(`Missing required 'name' property.`);
	} else if (isNlsString(name)) {
		throw new Error(`Property 'name' should be a literal string.`);
	}

	const categoryName = getStringProperty(configurationNode, 'title');

	if (!categoryName) {
		throw new Error(`Missing required 'title' property.`);
	} else if (!isNlsString(categoryName)) {
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
	} else if (isNlsString(minimumVersion)) {
		throw new Error(`Property 'minimumVersion' should be a literal string.`);
	}

	const description = getStringProperty(settingNode, 'description');

	if (!description) {
		throw new Error(`Missing required 'description' property.`);
	} if (!isNlsString(description)) {
		throw new Error(`Property 'description' should be localized.`);
	}

	let result: Policy | undefined;

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

function getPolicies(moduleName: string, node: Parser.SyntaxNode): Policy[] {
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

function renderGP(policies: Policy[], translations: Translations) {
	const appName = product.nameLong;
	const regKey = product.win32RegValueName;

	const versions = [...new Set(policies.map(p => p.minimumVersion)).values()].sort();
	const categories = [...new Set(policies.map(p => p.category))];

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

async function main() {
	const [policies, translations] = await Promise.all([parsePolicies(), getTranslations()]);
	const { admx, adml } = await renderGP(policies, translations);

	const root = '.build/policies/win32';
	await fs.rm(root, { recursive: true, force: true });
	await fs.mkdir(root, { recursive: true });

	await fs.writeFile(path.join(root, `${product.win32RegValueName}.admx`), admx.replace(/\r?\n/g, '\n'));

	for (const { languageId, contents } of adml) {
		const languagePath = path.join(root, languageId === 'en-us' ? 'en-us' : Languages[languageId as keyof typeof Languages]);
		await fs.mkdir(languagePath, { recursive: true });
		await fs.writeFile(path.join(languagePath, `${product.win32RegValueName}.adml`), contents.replace(/\r?\n/g, '\n'));
	}
}

if (require.main === module) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
