/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, Node, RuleMeta, Visitor } from '@oxlint/plugins';

/**
 * The selectors that name one kind of identifier, as bit flags. A group selector is the union of the flags of the
 * selectors that it groups.
 */
const selectorFlags = {
	variable: 1 << 0,
	function: 1 << 1,
	parameter: 1 << 2,
	parameterProperty: 1 << 3,
	classicAccessor: 1 << 4,
	enumMember: 1 << 5,
	classMethod: 1 << 6,
	objectLiteralMethod: 1 << 7,
	typeMethod: 1 << 8,
	classProperty: 1 << 9,
	objectLiteralProperty: 1 << 10,
	typeProperty: 1 << 11,
	autoAccessor: 1 << 12,
	class: 1 << 13,
	interface: 1 << 14,
	typeAlias: 1 << 15,
	enum: 1 << 16,
	typeParameter: 1 << 17,
	import: 1 << 18,
} as const;

type SelectorName = keyof typeof selectorFlags;

const groupSelectorFlags: Readonly<Record<string, number>> = {
	default: -1,
	variableLike: selectorFlags.variable | selectorFlags.function | selectorFlags.parameter,
	memberLike: selectorFlags.parameterProperty | selectorFlags.classicAccessor | selectorFlags.enumMember | selectorFlags.classMethod
		| selectorFlags.objectLiteralMethod | selectorFlags.typeMethod | selectorFlags.classProperty | selectorFlags.objectLiteralProperty
		| selectorFlags.typeProperty | selectorFlags.autoAccessor,
	typeLike: selectorFlags.class | selectorFlags.interface | selectorFlags.typeAlias | selectorFlags.enum | selectorFlags.typeParameter,
	method: selectorFlags.classMethod | selectorFlags.objectLiteralMethod | selectorFlags.typeMethod,
	property: selectorFlags.classProperty | selectorFlags.objectLiteralProperty | selectorFlags.typeProperty,
	accessor: selectorFlags.classicAccessor | selectorFlags.autoAccessor,
};

/**
 * The modifiers that this implementation can determine, with their weights: when two options have the same selector,
 * the option whose modifiers weigh more takes precedence.
 */
const modifierWeights: Readonly<Record<string, number>> = {
	'const': 1 << 0,
	'readonly': 1 << 1,
	'static': 1 << 2,
	'public': 1 << 3,
	'protected': 1 << 4,
	'private': 1 << 5,
	'#private': 1 << 6,
	'abstract': 1 << 7,
	'destructured': 1 << 8,
	'requiresQuotes': 1 << 12,
	'override': 1 << 13,
	'async': 1 << 14,
	'default': 1 << 15,
	'namespace': 1 << 16,
};

/** Options with a filter take precedence over all options without one. */
const filterWeight = 1 << 30;

const formatCheckers: Readonly<Record<string, (name: string) => boolean>> = {
	camelCase: name => name.length === 0 || (name[0] === name[0].toLowerCase() && !name.includes('_')),
	strictCamelCase: name => name.length === 0 || (name[0] === name[0].toLowerCase() && hasStrictHumps(name, false)),
	PascalCase: name => name.length === 0 || (name[0] === name[0].toUpperCase() && !name.includes('_')),
	StrictPascalCase: name => name.length === 0 || (name[0] === name[0].toUpperCase() && hasStrictHumps(name, true)),
	snake_case: name => name.length === 0 || (name === name.toLowerCase() && hasValidUnderscores(name)),
	UPPER_CASE: name => name.length === 0 || (name === name.toUpperCase() && hasValidUnderscores(name)),
};

/** Whether the name has no underscores, and no two uppercase letters in a row (the first letter counts as given). */
function hasStrictHumps(name: string, firstIsUpper: boolean): boolean {
	if (name.startsWith('_')) {
		return false;
	}
	let previousIsUpper = firstIsUpper;
	for (let i = 1; i < name.length; i++) {
		const char = name[i];
		if (char === '_') {
			return false;
		}
		const isUpper = char === char.toUpperCase() && char !== char.toLowerCase();
		if (isUpper && previousIsUpper) {
			return false;
		}
		previousIsUpper = isUpper;
	}
	return true;
}

/** Whether the name has no leading, trailing or consecutive underscores. */
function hasValidUnderscores(name: string): boolean {
	return !name.startsWith('_') && !name.endsWith('_') && !name.includes('__');
}

type UnderscoreOption = 'forbid' | 'allow' | 'require' | 'requireDouble' | 'allowDouble' | 'allowSingleOrDouble';

interface NamingOption {
	readonly selector: string | readonly string[];
	readonly modifiers?: readonly string[];
	readonly types?: readonly string[];
	readonly filter?: string | { readonly regex: string; readonly match: boolean };
	readonly format: readonly string[] | null;
	readonly custom?: { readonly regex: string; readonly match: boolean };
	readonly leadingUnderscore?: UnderscoreOption;
	readonly trailingUnderscore?: UnderscoreOption;
	readonly prefix?: readonly string[];
	readonly suffix?: readonly string[];
}

interface NamingConfig {
	readonly selector: number;
	readonly isGroup: boolean;
	readonly weight: number;
	readonly modifiers: readonly string[];
	readonly filter: { readonly regex: RegExp; readonly match: boolean } | undefined;
	readonly format: readonly string[];
	readonly custom: { readonly regex: RegExp; readonly match: boolean } | undefined;
	readonly leadingUnderscore: UnderscoreOption | undefined;
	readonly trailingUnderscore: UnderscoreOption | undefined;
	readonly prefix: readonly string[];
	readonly suffix: readonly string[];
}

function parseOption(option: NamingOption): NamingConfig[] {
	if (option.types) {
		throw new Error('naming-convention: the `types` option needs type information, which oxlint does not provide');
	}
	let weight = option.filter ? filterWeight : 0;
	for (const modifier of option.modifiers ?? []) {
		if (!Object.hasOwn(modifierWeights, modifier)) {
			throw new Error(`naming-convention: the modifier '${modifier}' is not supported`);
		}
		weight |= modifierWeights[modifier];
	}
	const filter = option.filter === undefined ? undefined : typeof option.filter === 'string'
		? { regex: new RegExp(option.filter, 'u'), match: true }
		: { regex: new RegExp(option.filter.regex, 'u'), match: option.filter.match };
	const custom = option.custom && { regex: new RegExp(option.custom.regex, 'u'), match: option.custom.match };
	for (const format of option.format ?? []) {
		if (!Object.hasOwn(formatCheckers, format)) {
			throw new Error(`naming-convention: unknown format '${format}'`);
		}
	}

	return [option.selector].flat().map(selector => {
		const isGroup = Object.hasOwn(groupSelectorFlags, selector);
		if (!isGroup && !Object.hasOwn(selectorFlags, selector)) {
			throw new Error(`naming-convention: unknown selector '${selector}'`);
		}
		return {
			selector: isGroup ? groupSelectorFlags[selector] : selectorFlags[selector as SelectorName],
			isGroup,
			weight,
			modifiers: option.modifiers ?? [],
			filter,
			format: option.format ?? [],
			custom,
			leadingUnderscore: option.leadingUnderscore,
			trailingUnderscore: option.trailingUnderscore,
			prefix: option.prefix ?? [],
			suffix: option.suffix ?? [],
		};
	});
}

/**
 * Orders the options that apply to one selector by precedence: options for single selectors, then for the `method` and
 * `property` groups, then for the other groups (larger groups first, `default` last). Options for the same selector are
 * ordered by the weight of their modifiers and filter.
 */
function comparePrecedence(a: NamingConfig, b: NamingConfig): number {
	if (a.selector === b.selector) {
		return b.weight - a.weight;
	}
	if (a.isGroup !== b.isGroup) {
		return a.isGroup ? 1 : -1;
	}
	const aIsMethodOrProperty = a.selector === groupSelectorFlags.method || a.selector === groupSelectorFlags.property;
	const bIsMethodOrProperty = b.selector === groupSelectorFlags.method || b.selector === groupSelectorFlags.property;
	if (aIsMethodOrProperty !== bIsMethodOrProperty) {
		return aIsMethodOrProperty ? -1 : 1;
	}
	return b.selector - a.selector;
}

type NameNode = ESTree.IdentifierName | ESTree.IdentifierReference | ESTree.BindingIdentifier | ESTree.PrivateIdentifier | ESTree.Expression | ESTree.TSEnumMemberName;

function nameOf(node: NameNode): string {
	return node.type === 'Identifier' || node.type === 'PrivateIdentifier' ? node.name : `${(node as { value?: unknown }).value}`;
}

/** Whether the name is not a valid identifier, so that a property with this name must be quoted. */
function requiresQuoting(name: string): boolean {
	return !/^[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*$/u.test(name);
}

/** The camelCase selector name as words, e.g. `Class Method`. */
function selectorDisplayName(selector: SelectorName): string {
	const words = selector.replace(/[A-Z]/g, ' $&');
	return words[0].toUpperCase() + words.slice(1);
}

function isFunctionValue(node: { type: string } | null | undefined): boolean {
	return node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression' || node?.type === 'TSEmptyBodyFunctionExpression';
}

/** The identifiers that a binding pattern declares. */
function boundIdentifiers(pattern: Node, result: ESTree.BindingIdentifier[] = []): ESTree.BindingIdentifier[] {
	const node = pattern as ESTree.Node;
	switch (node.type) {
		case 'Identifier':
			result.push(node as ESTree.BindingIdentifier);
			break;
		case 'ObjectPattern':
			for (const property of node.properties) {
				boundIdentifiers(property.type === 'RestElement' ? property.argument : property.value, result);
			}
			break;
		case 'ArrayPattern':
			for (const element of node.elements) {
				if (element) {
					boundIdentifiers(element, result);
				}
			}
			break;
		case 'RestElement':
			boundIdentifiers(node.argument, result);
			break;
		case 'AssignmentPattern':
			boundIdentifiers(node.left, result);
			break;
	}
	return result;
}

/** Whether the identifier is declared by a shorthand property of an object pattern, as in `const { x = 1 } = o`. */
function isDestructured(id: ESTree.BindingIdentifier): boolean {
	const parent = id.parent as ESTree.Node;
	if (parent.type === 'Property') {
		return parent.shorthand;
	}
	return parent.type === 'AssignmentPattern' && parent.parent.type === 'Property' && (parent.parent as ESTree.ObjectProperty).shorthand;
}

type ClassMember = ESTree.MethodDefinition | ESTree.PropertyDefinition | ESTree.AccessorProperty | ESTree.TSParameterProperty;

function memberModifiers(node: ClassMember): Set<string> {
	const modifiers = new Set<string>();
	if ('key' in node && node.key.type === 'PrivateIdentifier') {
		modifiers.add('#private');
	} else {
		modifiers.add(node.accessibility ?? 'public');
	}
	if (node.static) {
		modifiers.add('static');
	}
	if ('readonly' in node && node.readonly) {
		modifiers.add('readonly');
	}
	if (node.override) {
		modifiers.add('override');
	}
	if (node.type.startsWith('TSAbstract')) {
		modifiers.add('abstract');
	}
	return modifiers;
}

/**
 * The `naming-convention` rule of typescript-eslint, for options that do not need type information: each named thing
 * is checked against the first option, by precedence, whose selector, modifiers and filter apply to it. Supports all
 * selectors, formats, underscore, affix, filter and custom options, and the modifiers that can be determined without
 * scope analysis.
 */
export default new class NamingConvention implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'suggestion',
		docs: { description: 'Enforce naming conventions for everything across a codebase' },
		messages: {
			doesNotMatchFormat: '{{type}} name `{{name}}` must match one of the following formats: {{formats}}',
			doesNotMatchFormatTrimmed: '{{type}} name `{{name}}` trimmed as `{{processedName}}` must match one of the following formats: {{formats}}',
			missingAffix: '{{type}} name `{{name}}` must have one of the following {{position}}es: {{affixes}}',
			missingUnderscore: '{{type}} name `{{name}}` must have {{count}} {{position}} underscore(s).',
			satisfyCustom: '{{type}} name `{{name}}` must {{regexMatch}} the RegExp: {{regex}}',
			unexpectedUnderscore: '{{type}} name `{{name}}` must not have a {{position}} underscore.',
		},
		schema: false,
	};

	create(context: Context): Visitor {
		if (context.options.length === 0) {
			throw new Error('naming-convention: the default options are not supported, configure the options explicitly');
		}
		const allConfigs = (context.options as readonly unknown[] as readonly NamingOption[]).flatMap(parseOption);
		const validators = new Map<SelectorName, (node: NameNode, modifiers: Set<string>) => void>();
		const validate = (selector: SelectorName, node: NameNode, modifiers = new Set<string>()): void => {
			let validator = validators.get(selector);
			if (!validator) {
				validator = createValidator(context, selector, allConfigs);
				validators.set(selector, validator);
			}
			validator(node, modifiers);
		};
		const validateMember = (selector: SelectorName, key: NameNode, modifiers: Set<string>): void => {
			if (requiresQuoting(nameOf(key))) {
				modifiers.add('requiresQuotes');
			}
			validate(selector, key, modifiers);
		};

		const checkFunctionName = (node: ESTree.Function): void => {
			if (node.id && node.type !== 'TSEmptyBodyFunctionExpression') {
				validate('function', node.id, new Set(node.async ? ['async'] : []));
			}
		};
		const checkParameters = (node: ESTree.Function | ESTree.ArrowFunctionExpression): void => {
			for (const param of node.params) {
				if (param.type === 'TSParameterProperty') {
					continue;
				}
				for (const id of boundIdentifiers(param)) {
					validate('parameter', id, new Set(isDestructured(id) ? ['destructured'] : []));
				}
			}
		};
		const checkFunction = (node: ESTree.Function): void => {
			checkFunctionName(node);
			checkParameters(node);
		};
		const checkClassProperty = (node: ESTree.PropertyDefinition): void => {
			if (node.computed) {
				return;
			}
			const modifiers = memberModifiers(node);
			if (isFunctionValue(node.value)) {
				if ((node.value as ESTree.Function | ESTree.ArrowFunctionExpression).async) {
					modifiers.add('async');
				}
				validateMember('classMethod', node.key, modifiers);
			} else {
				validateMember('classProperty', node.key, modifiers);
			}
		};
		const checkClassMethod = (node: ESTree.MethodDefinition): void => {
			if (node.computed || node.kind === 'constructor') {
				return;
			}
			const modifiers = memberModifiers(node);
			if (node.kind === 'method') {
				if (node.value.async) {
					modifiers.add('async');
				}
				validateMember('classMethod', node.key, modifiers);
			} else {
				validateMember('classicAccessor', node.key, modifiers);
			}
		};
		const checkAutoAccessor = (node: ESTree.AccessorProperty): void => {
			validateMember('autoAccessor', node.key, memberModifiers(node));
		};
		const checkClass = (node: ESTree.Class): void => {
			if (node.id) {
				validate('class', node.id, new Set(node.abstract ? ['abstract'] : []));
			}
		};

		return {
			VariableDeclarator(node: ESTree.VariableDeclarator) {
				const isConst = (node.parent as ESTree.VariableDeclaration).kind === 'const';
				for (const id of boundIdentifiers(node.id)) {
					const modifiers = new Set<string>();
					if (isConst) {
						modifiers.add('const');
					}
					if (isDestructured(id)) {
						modifiers.add('destructured');
					}
					const parent = id.parent as { async?: boolean; init?: { async?: boolean } | null };
					if (parent.async || parent.init?.async) {
						modifiers.add('async');
					}
					validate('variable', id, modifiers);
				}
			},
			FunctionDeclaration: checkFunction,
			FunctionExpression: checkFunction,
			TSDeclareFunction: checkFunction,
			TSEmptyBodyFunctionExpression: checkParameters,
			ArrowFunctionExpression: checkParameters,
			ImportDefaultSpecifier(node: ESTree.ImportDefaultSpecifier) {
				validate('import', node.local, new Set(['default']));
			},
			ImportNamespaceSpecifier(node: ESTree.ImportNamespaceSpecifier) {
				validate('import', node.local, new Set(['namespace']));
			},
			ImportSpecifier(node: ESTree.ImportSpecifier) {
				// Only `import { default as x }` is an import that names the module's export.
				if (node.imported.type !== 'Identifier' || node.imported.name === 'default') {
					validate('import', node.local, new Set(['default']));
				}
			},
			PropertyDefinition: checkClassProperty,
			TSAbstractPropertyDefinition: checkClassProperty,
			MethodDefinition: checkClassMethod,
			TSAbstractMethodDefinition: checkClassMethod,
			AccessorProperty: checkAutoAccessor,
			TSAbstractAccessorProperty: checkAutoAccessor,
			Property(node: ESTree.ObjectProperty) {
				if (node.computed) {
					return;
				}
				if (node.kind !== 'init') {
					validateMember('classicAccessor', node.key, new Set(['public']));
				} else if (isFunctionValue(node.value)) {
					const modifiers = new Set(['public']);
					if ((node.value as ESTree.Function | ESTree.ArrowFunctionExpression).async) {
						modifiers.add('async');
					}
					validateMember('objectLiteralMethod', node.key, modifiers);
				} else if (node.parent.type !== 'ObjectPattern') {
					validateMember('objectLiteralProperty', node.key, new Set(['public']));
				}
			},
			TSMethodSignature(node: ESTree.TSMethodSignature) {
				if (!node.computed) {
					validateMember('typeMethod', node.key, new Set(['public']));
				}
			},
			TSPropertySignature(node: ESTree.TSPropertySignature) {
				if (node.computed) {
					return;
				}
				if (node.typeAnnotation?.typeAnnotation.type === 'TSFunctionType') {
					validateMember('typeMethod', node.key, new Set(['public']));
				} else {
					validateMember('typeProperty', node.key, new Set(node.readonly ? ['public', 'readonly'] : ['public']));
				}
			},
			TSParameterProperty(node: ESTree.TSParameterProperty) {
				const modifiers = memberModifiers(node);
				for (const id of boundIdentifiers(node.parameter)) {
					validate('parameterProperty', id, modifiers);
				}
			},
			ClassDeclaration: checkClass,
			ClassExpression: checkClass,
			TSEnumDeclaration(node: ESTree.TSEnumDeclaration) {
				validate('enum', node.id);
			},
			TSEnumMember(node: ESTree.TSEnumMember) {
				validateMember('enumMember', node.id, new Set());
			},
			TSInterfaceDeclaration(node: ESTree.TSInterfaceDeclaration) {
				validate('interface', node.id);
			},
			TSTypeAliasDeclaration(node: ESTree.TSTypeAliasDeclaration) {
				validate('typeAlias', node.id);
			},
			TSTypeParameter(node: ESTree.TSTypeParameter) {
				if (node.parent.type === 'TSTypeParameterDeclaration') {
					validate('typeParameter', node.name);
				}
			},
		};
	}
};

function createValidator(context: Context, selector: SelectorName, allConfigs: readonly NamingConfig[]): (node: NameNode, modifiers: Set<string>) => void {
	const flag = selectorFlags[selector];
	const configs = allConfigs.filter(config => (config.selector & flag) !== 0).sort(comparePrecedence);
	const type = selectorDisplayName(selector);

	const report = (node: NameNode, messageId: string, data: Record<string, string>): void => {
		context.report({ node, messageId, data: { type, name: nameOf(node), ...data } });
	};

	/** The name without the underscores that the option allows or requires, or `undefined` after reporting. */
	const trimUnderscores = (node: NameNode, name: string, position: 'leading' | 'trailing', option: UnderscoreOption | undefined): string | undefined => {
		const has = (count: number) => position === 'leading' ? name.startsWith('_'.repeat(count)) : name.endsWith('_'.repeat(count));
		const trim = (count: number) => position === 'leading' ? name.slice(count) : name.slice(0, -count);
		switch (option) {
			case 'allow':
				return has(1) ? trim(1) : name;
			case 'allowDouble':
				return has(2) ? trim(2) : name;
			case 'allowSingleOrDouble':
				return has(2) ? trim(2) : has(1) ? trim(1) : name;
			case 'forbid':
				if (has(1)) {
					report(node, 'unexpectedUnderscore', { position });
					return undefined;
				}
				return name;
			case 'require':
				if (!has(1)) {
					report(node, 'missingUnderscore', { count: 'one', position });
					return undefined;
				}
				return trim(1);
			case 'requireDouble':
				if (!has(2)) {
					report(node, 'missingUnderscore', { count: 'two', position });
					return undefined;
				}
				return trim(2);
			default:
				return name;
		}
	};

	/** The name without the first of the affixes that it has, or `undefined` after reporting. */
	const trimAffix = (node: NameNode, name: string, position: 'prefix' | 'suffix', affixes: readonly string[]): string | undefined => {
		if (affixes.length === 0) {
			return name;
		}
		for (const affix of affixes) {
			if (position === 'prefix' ? name.startsWith(affix) : name.endsWith(affix)) {
				return position === 'prefix' ? name.slice(affix.length) : name.slice(0, -affix.length);
			}
		}
		report(node, 'missingAffix', { position, affixes: affixes.join(', ') });
		return undefined;
	};

	return (node, modifiers) => {
		const originalName = nameOf(node);
		const config = configs.find(config =>
			(!config.filter || config.filter.regex.test(originalName) === config.filter.match)
			&& config.modifiers.every(modifier => modifiers.has(modifier)));
		if (!config) {
			return;
		}

		let name: string | undefined = originalName;
		name = trimUnderscores(node, name, 'leading', config.leadingUnderscore);
		name = name === undefined ? undefined : trimUnderscores(node, name, 'trailing', config.trailingUnderscore);
		name = name === undefined ? undefined : trimAffix(node, name, 'prefix', config.prefix);
		name = name === undefined ? undefined : trimAffix(node, name, 'suffix', config.suffix);
		if (name === undefined) {
			return;
		}
		if (config.custom && config.custom.regex.test(name) !== Boolean(config.custom.match)) {
			report(node, 'satisfyCustom', { regex: String(config.custom.regex), regexMatch: config.custom.match ? 'match' : 'not match' });
			return;
		}
		if (config.format.length === 0) {
			return;
		}
		// A name that must be quoted matches no format.
		if (!modifiers.has('requiresQuotes') && config.format.some(format => formatCheckers[format](name))) {
			return;
		}
		report(node, name === originalName ? 'doesNotMatchFormat' : 'doesNotMatchFormatTrimmed', {
			processedName: name,
			formats: config.format.join(', '),
		});
	};
}
