/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

export default new class ApiEventNaming implements CreateRule {

	private static _nameRegExp = /on(Did|Will)([A-Z][a-z]+)([A-Z][a-z]+)?/;

	readonly meta: RuleMeta = {
		docs: {
			url: 'https://github.com/microsoft/vscode/wiki/Extension-API-guidelines#event-naming'
		},
		messages: {
			naming: 'Event names must follow this patten: `on[Did|Will]<Verb><Subject>`',
			verb: 'Unknown verb \'{{verb}}\' - is this really a verb? Iff so, then add this verb to the configuration',
			subject: 'Unknown subject \'{{subject}}\' - This subject has not been used before but it should refer to something in the API',
			unknown: 'UNKNOWN event declaration, lint-rule needs tweaking'
		},
		schema: false,
	};

	create(context: Context): Visitor {

		const config = context.options[0] as { allowed: string[]; verbs: string[] };
		const allowed = new Set(config.allowed);
		const verbs = new Set(config.verbs);

		return {
			['TSTypeAnnotation TSTypeReference Identifier[name="Event"]']: (node: ESTree.IdentifierReference) => {

				const def = node.parent?.parent?.parent;
				const ident = this.getIdent(def);

				if (!ident) {
					// event on unknown structure...
					return context.report({
						node,
						message: 'unknown'
					});
				}

				if (allowed.has(ident.name)) {
					// configured exception
					return;
				}

				const match = ApiEventNaming._nameRegExp.exec(ident.name);
				if (!match) {
					context.report({
						node: ident,
						messageId: 'naming'
					});
					return;
				}

				// check that <verb> is spelled out (configured) as verb
				if (!verbs.has(match[2].toLowerCase())) {
					context.report({
						node: ident,
						messageId: 'verb',
						data: { verb: match[2] }
					});
				}

				// check that a subject (if present) has occurred
				if (match[3]) {
					const regex = new RegExp(match[3], 'ig');
					const parts = context.sourceCode.getText().split(regex);
					if (parts.length < 3) {
						context.report({
							node: ident,
							messageId: 'subject',
							data: { subject: match[3] }
						});
					}
				}
			}
		};
	}

	private getIdent(def: ESTree.Node | null | undefined): ESTree.IdentifierReference | ESTree.IdentifierName | ESTree.BindingIdentifier | undefined {
		if (!def) {
			return;
		}

		if (def.type === 'Identifier') {
			return def;
		} else if ((def.type === 'TSPropertySignature' || def.type === 'PropertyDefinition') && def.key.type === 'Identifier') {
			return def.key;
		}

		return this.getIdent(def.parent);
	}
};
