/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import type { ParserServicesWithTypeInformation } from '@typescript-eslint/typescript-estree';
import * as ts from 'typescript';

/**
 * Matches declaration files that ship as part of the Copilot SDK, i.e. either
 * the `@github/copilot` or the `@github/copilot-sdk` package.
 */
const COPILOT_SDK_DECLARATION = /[/\\]node_modules[/\\]@github[/\\]copilot(-sdk)?[/\\]/;

type MessageIds = 'deprecatedCopilotSdkApi' | 'deprecatedCopilotSdkApiWithReason';

/**
 * Flags usages of `@deprecated` members that are declared by the Copilot SDK
 * (`@github/copilot` / `@github/copilot-sdk`).
 *
 * Unlike `@typescript-eslint/no-deprecated`, this rule only reports symbols
 * whose declaration originates from the SDK, so it stays focused on the SDK
 * surface that the agent host consumes. Because the check reads the
 * `@deprecated` JSDoc tag straight from the SDK's type declarations, it
 * automatically picks up newly deprecated members whenever the SDK is updated.
 */
export default ESLintUtils.RuleCreator.withoutDocs<[], MessageIds>({
	name: 'code-no-deprecated-copilot-sdk',
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow using Copilot SDK members marked as `@deprecated`',
		},
		messages: {
			deprecatedCopilotSdkApi: `'{{name}}' is a deprecated Copilot SDK member. Migrate off it before it is removed in a future SDK update.`,
			deprecatedCopilotSdkApiWithReason: `'{{name}}' is a deprecated Copilot SDK member. {{reason}}`,
		},
		schema: [],
	},
	defaultOptions: [],
	create(context) {
		const services: ParserServicesWithTypeInformation = ESLintUtils.getParserServices(context);
		const checker = services.program.getTypeChecker();

		/**
		 * Returns the deprecation reason (possibly an empty string) when `symbol`
		 * is both marked `@deprecated` and declared by the Copilot SDK; otherwise
		 * returns `undefined`. Aliased symbols (e.g. imported names) are followed
		 * to their original declaration.
		 */
		function getSdkDeprecation(symbol: ts.Symbol | undefined): string | undefined {
			if (!symbol) {
				return undefined;
			}

			const candidates: ts.Symbol[] = [symbol];
			if (symbol.flags & ts.SymbolFlags.Alias) {
				try {
					candidates.push(checker.getAliasedSymbol(symbol));
				} catch {
					// Ignore symbols that cannot be resolved to an alias target.
				}
			}

			for (const candidate of candidates) {
				let tags: ts.JSDocTagInfo[];
				try {
					tags = candidate.getJsDocTags(checker);
				} catch {
					// Workaround for https://github.com/microsoft/TypeScript/issues/60024
					continue;
				}

				const deprecatedTag = tags.find(tag => tag.name === 'deprecated');
				if (!deprecatedTag) {
					continue;
				}

				const declarations = candidate.getDeclarations() ?? [];
				const fromSdk = declarations.some(declaration =>
					COPILOT_SDK_DECLARATION.test(declaration.getSourceFile().fileName));
				if (!fromSdk) {
					continue;
				}

				return deprecatedTag.text ? ts.displayPartsToString(deprecatedTag.text) : '';
			}

			return undefined;
		}

		function report(node: TSESTree.Node, name: string, reason: string): void {
			context.report({
				node,
				...(reason
					? { messageId: 'deprecatedCopilotSdkApiWithReason', data: { name, reason } }
					: { messageId: 'deprecatedCopilotSdkApi', data: { name } }),
			});
		}

		return {
			MemberExpression(node: TSESTree.MemberExpression): void {
				if (node.computed) {
					// `obj['parentToolCallId']`
					const property = node.property;
					if (property.type !== 'Literal' || typeof property.value !== 'string') {
						return;
					}
					const objectType = services.getTypeAtLocation(node.object);
					const reason = getSdkDeprecation(objectType.getProperty(property.value));
					if (reason !== undefined) {
						report(property, property.value, reason);
					}
				} else {
					// `obj.parentToolCallId`
					const reason = getSdkDeprecation(services.getSymbolAtLocation(node.property));
					if (reason !== undefined) {
						report(node.property, node.property.name, reason);
					}
				}
			},

			// `const { parentToolCallId } = data;`
			'ObjectPattern > Property'(node: TSESTree.Property): void {
				if (node.computed || node.key.type !== 'Identifier') {
					return;
				}
				const objectType = services.getTypeAtLocation(node.parent);
				const reason = getSdkDeprecation(objectType.getProperty(node.key.name));
				if (reason !== undefined) {
					report(node.key, node.key.name, reason);
				}
			},

			// Direct usage of a deprecated top-level SDK export, e.g.
			// `deprecatedFn()`, `new DeprecatedClass()`, `type X = DeprecatedType`
			// or a plain `deprecatedConst` reference. Member access and
			// destructuring are handled above, and import/export bindings and
			// declaration names are not usages, so all of those are skipped to
			// avoid double-reporting.
			Identifier(node: TSESTree.Identifier): void {
				const parent = node.parent;
				switch (parent.type) {
					case 'MemberExpression':
						if (parent.property === node && !parent.computed) {
							return;
						}
						break;
					case 'Property':
						if (parent.key === node && !parent.computed) {
							return;
						}
						break;
					case 'ImportSpecifier':
					case 'ImportDefaultSpecifier':
					case 'ImportNamespaceSpecifier':
					case 'ExportSpecifier':
						return;
				}
				const reason = getSdkDeprecation(services.getSymbolAtLocation(node));
				if (reason !== undefined) {
					report(node, node.name, reason);
				}
			},
		};
	},
});
