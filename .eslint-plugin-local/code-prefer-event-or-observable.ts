/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TSESTree } from '@typescript-eslint/utils';
import type * as eslint from 'eslint';
import type * as ESTree from 'estree';

type Options = {
	checkPublicMethods?: boolean;
};

type MessageId = 'constructorCallback' | 'methodCallback';

export default new class PreferEventOrObservable implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		type: 'suggestion',
		docs: {
			description: 'Prefer events and observables over callback dependencies in constructors and public methods.',
		},
		messages: {
			constructorCallback: 'Prefer an Event for notifications or an IObservable for changing values instead of the constructor callback "{{name}}". For other behavior, consider an injected service or a return value.',
			methodCallback: 'Prefer an Event for notifications or an IObservable for changing values instead of the public method callback "{{name}}". For other behavior, consider an injected service or a return value.',
		},
		schema: [{
			type: 'object',
			properties: {
				checkPublicMethods: { type: 'boolean', default: true },
			},
			additionalProperties: false,
		}],
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const options = context.options[0] as Options | undefined;
		const checkPublicMethods = options?.checkPublicMethods ?? true;

		function checkParameters(parameters: TSESTree.Parameter[], messageId: MessageId): void {
			for (const original of parameters) {
				let parameter = original.type === 'TSParameterProperty' ? original.parameter : original;
				let initializer: TSESTree.Expression | undefined;
				if (parameter.type === 'AssignmentPattern') {
					initializer = parameter.right;
					parameter = parameter.left;
				}

				const type = parameter.typeAnnotation?.typeAnnotation;
				const name = parameter.type === 'RestElement' ? parameter.argument : parameter;
				if (name.type !== 'Identifier') {
					continue;
				}

				if (isCallbackType(type, context.sourceCode)
					|| (!type && (initializer?.type === 'ArrowFunctionExpression' || initializer?.type === 'FunctionExpression'))) {
					context.report({ node: name, messageId, data: { name: name.name } });
				}
			}
		}

		const listeners: eslint.Rule.RuleListener = {
			':matches(MethodDefinition, TSAbstractMethodDefinition)': (node: ESTree.Node) => {
				const method = node as TSESTree.MethodDefinition | TSESTree.TSAbstractMethodDefinition;
				if (method.kind === 'constructor') {
					checkParameters(method.value.params, 'constructorCallback');
				} else if (checkPublicMethods && isPublicMember(method)) {
					checkParameters(method.value.params, 'methodCallback');
				}
			},
		};

		if (checkPublicMethods) {
			listeners.TSMethodSignature = (node: ESTree.Node | TSESTree.TSMethodSignature) => {
				if (node.type === 'TSMethodSignature') {
					checkParameters(node.params, 'methodCallback');
				}
			};
			listeners.TSPropertySignature = (node: ESTree.Node | TSESTree.TSPropertySignature) => {
				if (node.type === 'TSPropertySignature' && node.typeAnnotation?.typeAnnotation.type === 'TSFunctionType') {
					checkParameters(node.typeAnnotation.typeAnnotation.params, 'methodCallback');
				}
			};
			listeners[':matches(PropertyDefinition, TSAbstractPropertyDefinition)'] = (node: ESTree.Node) => {
				const property = node as TSESTree.PropertyDefinition | TSESTree.TSAbstractPropertyDefinition;
				if (!isPublicMember(property)) {
					return;
				}
				const type = property.typeAnnotation?.typeAnnotation;
				if (type?.type === 'TSFunctionType') {
					checkParameters(type.params, 'methodCallback');
				} else if (!type && (property.value?.type === 'ArrowFunctionExpression' || property.value?.type === 'FunctionExpression')) {
					checkParameters(property.value.params, 'methodCallback');
				}
			};
		}

		return listeners;
	}
};

function isPublicMember(node: TSESTree.MethodDefinition | TSESTree.TSAbstractMethodDefinition | TSESTree.PropertyDefinition | TSESTree.TSAbstractPropertyDefinition): boolean {
	return node.accessibility !== 'private' && node.accessibility !== 'protected' && node.key.type !== 'PrivateIdentifier';
}

function isCallbackType(type: TSESTree.TypeNode | undefined, sourceCode: eslint.SourceCode, seen = new Set<TSESTree.Node>()): boolean {
	if (!type || seen.has(type)) {
		return false;
	}
	seen.add(type);

	switch (type.type) {
		case 'TSFunctionType':
			return true;
		case 'TSUnionType':
		case 'TSIntersectionType':
			return type.types.some(member => isCallbackType(member, sourceCode, seen));
		case 'TSTypeLiteral':
			return type.members.some(member => member.type === 'TSCallSignatureDeclaration');
		case 'TSTypeReference': {
			if (type.typeName.type !== 'Identifier' || type.typeName.name === 'Event') {
				return false;
			}
			const name = type.typeName.name;
			for (let scope: eslint.Scope.Scope | null = sourceCode.getScope(type.typeName); scope; scope = scope.upper) {
				const variable = scope.set.get(name);
				if (!variable || variable.defs.length === 0) {
					continue;
				}
				return variable.defs.some(definition => {
					const declaration = definition.node as TSESTree.Node;
					if (declaration.type === 'TSTypeAliasDeclaration') {
						return isCallbackType(declaration.typeAnnotation, sourceCode, seen);
					}
					if (declaration.type === 'TSInterfaceDeclaration') {
						return declaration.body.body.some(member => member.type === 'TSCallSignatureDeclaration');
					}
					return false;
				});
			}
			return name === 'Function' || name === 'CallableFunction';
		}
		default:
			return false;
	}
}
