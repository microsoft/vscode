/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SyntaxNode } from 'web-tree-sitter';
import { WASMLanguage } from './treeSitterLanguages';

/**
 * Extracts the identifier for the given node (is based on heuristics, so not 100% accurate for all languages)
 */
export function extractIdentifier(node: SyntaxNode, languageId: string): string | undefined {
	switch (languageId) {
		case 'python':
		case 'csharp':
			return node.children.find(c => c.type.match(/identifier/))?.text;
		case 'go': {
			const identifierChild = node.children.find(c => c.type.match(/identifier/));
			if (identifierChild) { return identifierChild.text; }
			const specChild = node.children.find(c => c.type.match(/spec/));
			return specChild?.children.find(c => c.type.match(/identifier/))?.text;
		}
		case 'javascript':
		case 'javascriptreact':
		case 'typescript':
		case 'typescriptreact':
		case 'cpp': {
			const declarator = node.children.find(c => c.type.match(/declarator/));
			if (declarator) { return declarator.children.find(c => c.type.match(/identifier/))?.text; }
			const identifierChild = node.children.find(c => c.type.match(/identifier/));
			return identifierChild?.text;
		}
		case 'java': {
			/*
				handles
				```java
				// class identifier
				class Fo<<>>o { }

				class Foo {
					// method identifier
					public void ba<<>>r() { }
				}

				// enum identifier
				enum F<<>>oo {
					// enum constant identifier
					BA<<>>Z
				}

				// interface identifier
				interface Fo<<>>o { }
				```
			*/
			const identifierChild = node.children.find(c => c.type === 'identifier');
			return identifierChild?.text;
		}
		case 'ruby':
			return node.children.find(c => c.type.match(/constant|identifier/))?.text;
		default:
			return node.children.find(c => c.type.match(/identifier/))?.text;
	}
}


export function isDocumentableNode(node: SyntaxNode, language: WASMLanguage) {
	switch (language) {
		case WASMLanguage.TypeScript:
		case WASMLanguage.TypeScriptTsx:
		case WASMLanguage.JavaScript:
			return node.type.match(/definition|declaration|declarator|export_statement/);
		case WASMLanguage.Go:
			return node.type.match(/definition|declaration|declarator|var_spec/);
		case WASMLanguage.Cpp:
			return node.type.match(/definition|declaration|class_specifier/);
		case WASMLanguage.Ruby:
			return node.type.match(/module|class|method|assignment/);
		case WASMLanguage.Python:
			// Match `function_definition`/`class_definition`, plus the wrapping
			// `decorated_definition` so that selections/cursors *on the decorator
			// line itself* still resolve to the function/class (rather than
			// climbing all the way up to `module`). Callers must unwrap a matched
			// `decorated_definition` to its inner definition via
			// {@link unwrapPythonDecoratedDefinition} so that downstream consumers
			// (e.g. docstring generation) treat the `def`/`class` line — not the
			// `@decorator` line — as the start of the definition. Otherwise
			// docstrings end up *before* the decorator, which is a syntax error.
			// See https://github.com/microsoft/vscode/issues/283165.
			return node.type.match(/^(function_definition|class_definition|decorated_definition)$/);
		default:
			return node.type.match(/definition|declaration|declarator/);
	}
}

/**
 * In Python, a `decorated_definition` wraps a `function_definition` or
 * `class_definition` whenever decorators are present. Its range starts at the
 * `@decorator` line, which is *not* what callers want as "the node to
 * document" — placing a docstring at that range would put it before the
 * decorator (a syntax error). This helper unwraps a `decorated_definition` to
 * its inner `function_definition`/`class_definition` so the range starts at
 * the `def`/`class` keyword.
 *
 * See {@link isDocumentableNode} and https://github.com/microsoft/vscode/issues/283165.
 */
export function unwrapPythonDecoratedDefinition(node: SyntaxNode, language: WASMLanguage): SyntaxNode {
	if (language !== WASMLanguage.Python || node.type !== 'decorated_definition') {
		return node;
	}
	return node.children.find(c => c.type === 'function_definition' || c.type === 'class_definition') ?? node;
}
