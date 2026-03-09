/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';
import { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/utils';

export default new class ApiEventNaming implements eslint.Rule.RuleModule {

	private static _nameRegExp = /^on(Did|Will)([A-Z][a-z]+)((?:[A-Z][a-z]+)*)$/;

	readonly meta: eslint.Rule.RuleMetaData = {
		docs: {
			url: 'https://github.com/microsoft/vscode/wiki/Extension-API-guidelines#event-naming',
			description: 'Ensures event names follow the pattern: on[Did|Will]<Verb><Subject>'
		},
		messages: {
			naming: 'Event names must follow this pattern: `on[Did|Will]<Verb><Subject>`',
			verb: 'Unknown verb \'{{verb}}\' - is this really a verb? If so, add this verb to the configuration',
			subject: 'Unknown subject \'{{subject}}\' - This subject should refer to something in the API. Add it to the configuration if it\'s valid.',
			unknown: 'UNKNOWN event declaration, lint-rule needs tweaking',
			invalidSelector: 'Could not find identifier for Event type declaration'
		},
		schema: [
			{
				type: 'object',
				properties: {
					allowed: {
						type: 'array',
						items: { type: 'string' },
						description: 'List of event names that are allowed exceptions'
					},
					verbs: {
						type: 'array',
						items: { type: 'string' },
						description: 'List of allowed verbs (in lowercase)'
					},
					subjects: {
						type: 'array',
						items: { type: 'string' },
						description: 'List of known API subjects (in lowercase)'
					}
				},
				additionalProperties: false,
				required: ['verbs', 'subjects']
			}
		],
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const config = context.options[0] || { allowed: [], verbs: [], subjects: [] };
		
		// Validate configuration
		if (!Array.isArray(config.verbs) || !Array.isArray(config.subjects)) {
			throw new Error('Invalid configuration: "verbs" and "subjects" must be arrays');
		}
		
		const allowed = new Set((config.allowed || []).map((s: string) => s.toLowerCase()));
		const verbs = new Set((config.verbs || []).map((s: string) => s.toLowerCase()));
		const subjects = new Set((config.subjects || []).map((s: string) => s.toLowerCase()));
		
		// Helper to check if identifier refers to Event type
		const isEventTypeReference = (node: ESTree.Identifier): boolean => {
			// Check if this identifier is part of a type reference
			const parent = node.parent as TSESTree.Node;
			
			if (parent?.type === AST_NODE_TYPES.TSTypeReference) {
				// It's definitely a type reference like Event<T>
				return true;
			}
			
			// Check other patterns where Event might appear
			if (parent?.type === AST_NODE_TYPES.TSQualifiedName) {
				// Could be vscode.Event or similar
				const grandParent = parent.parent;
				if (grandParent?.type === AST_NODE_TYPES.TSTypeReference) {
					return true;
				}
			}
			
			return false;
		};
		
		// Helper to extract the identifier name from different AST patterns
		const getEventIdentifier = (node: ESTree.Identifier): TSESTree.Identifier | null => {
			let current: TSESTree.Node | undefined = node.parent?.parent;
			let depth = 0;
			const maxDepth = 10; // Safety limit to prevent infinite loops
			
			while (current && depth < maxDepth) {
				depth++;
				
				// Property signature in interface/type alias
				if (current.type === AST_NODE_TYPES.TSPropertySignature && 
					current.key.type === AST_NODE_TYPES.Identifier) {
					return current.key;
				}
				
				// Property definition in class
				if (current.type === AST_NODE_TYPES.PropertyDefinition && 
					current.key.type === AST_NODE_TYPES.Identifier) {
					return current.key;
				}
				
				// Variable declaration
				if (current.type === AST_NODE_TYPES.VariableDeclarator && 
					current.id.type === AST_NODE_TYPES.Identifier) {
					return current.id;
				}
				
				// Type alias
				if (current.type === AST_NODE_TYPES.TSTypeAliasDeclaration && 
					current.id.type === AST_NODE_TYPES.Identifier) {
					return current.id;
				}
				
				// Move up the tree
				current = current.parent;
			}
			
			return null;
		};
		
		// Helper to extract subject from camelCase/PascalCase
		const extractSubject = (name: string): string => {
			// Find the last capital letter followed by lowercase letters
			// This handles multi-word subjects like "TextDocument" or "ActiveEditor"
			const match = name.match(/[A-Z][a-z]+$/);
			return match ? match[0] : '';
		};
		
		// Helper to extract verb from the name
		const extractVerb = (name: string, match: RegExpExecArray): string => {
			// The verb is the first word after Did/Will
			return match[2];
		};
		
		return {
			'Identifier': (node: ESTree.Identifier) => {
				// Only process identifiers named "Event"
				if (node.name !== 'Event') {
					return;
				}
				
				// Check if this is actually a type reference to Event
				if (!isEventTypeReference(node)) {
					return;
				}
				
				// Find the identifier that names this event
				const ident = getEventIdentifier(node);
				
				if (!ident) {
					// Couldn't find the identifier - report and skip
					context.report({
						node,
						messageId: 'invalidSelector'
					});
					return;
				}
				
				const eventName = ident.name;
				
				// Check if this is an allowed exception
				if (allowed.has(eventName.toLowerCase())) {
					return;
				}
				
				// Check naming pattern
				const match = ApiEventNaming._nameRegExp.exec(eventName);
				if (!match) {
					context.report({
						node: ident,
						messageId: 'naming'
					});
					return;
				}
				
				// Extract verb and subject
				const verb = extractVerb(eventName, match);
				const subject = extractSubject(eventName);
				
				// Check verb
				if (!verbs.has(verb.toLowerCase())) {
					context.report({
						node: ident,
						messageId: 'verb',
						data: { verb }
					});
				}
				
				// Check subject (if present)
				if (subject && !subjects.has(subject.toLowerCase())) {
					context.report({
						node: ident,
						messageId: 'subject',
						data: { subject }
					});
				}
			}
		};
	}
};
