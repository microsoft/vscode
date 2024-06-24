/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Disposable, LanguageServiceContext, LanguageServicePlugin, ProviderResult } from '@volar/language-service';
import * as ts from 'typescript';
import { create as createCssPlugin } from 'volar-service-css';
import { create as createHtmlPlugin } from 'volar-service-html';
import { create as createJsonPlugin } from 'volar-service-json';
import { create as createTypeScriptPlugins } from 'volar-service-typescript';
import { isTsDocument } from 'volar-service-typescript/lib/shared';
import { IHTMLDataProvider, TextDocument, TextEdit } from 'vscode-html-languageservice';

export function getLanguageServicePlugins(options: {
	supportedLanguages: { [languageId: string]: boolean },
	getCustomData: (context: LanguageServiceContext) => ProviderResult<IHTMLDataProvider[]>,
	onDidChangeCustomData: (listener: () => void) => Disposable,
	formatterMaxNumberOfEdits?: number,
}) {
	const plugins: LanguageServicePlugin[] = [
		{
			capabilities: {},
			create() {
				return {
					resolveEmbeddedCodeFormattingOptions(_sourceScript, embeddedCode, options) {
						if (embeddedCode.id.startsWith('style_')) {
							options.initialIndentLevel++;
						}
						return options;
					},
				};
			},
		},
	];
	const baseHtmlPlugin = createHtmlPlugin({
		async isFormattingEnabled(_document, context) {
			return await context.env.getConfiguration?.('html.format.enable') ?? true;
		},
		getCustomData: options.getCustomData,
		onDidChangeCustomData: options.onDidChangeCustomData,
	});
	plugins.push({
		...baseHtmlPlugin,
		create(context) {
			const base = baseHtmlPlugin.create(context);
			return {
				...base,
				async provideDocumentFormattingEdits(document, ...args) {
					const edits = await base.provideDocumentFormattingEdits?.(document, ...args);
					if (edits && options.formatterMaxNumberOfEdits !== undefined && edits.length > options.formatterMaxNumberOfEdits) {
						const newText = TextDocument.applyEdits(document, edits);
						return [TextEdit.replace({ start: document.positionAt(0), end: document.positionAt(document.getText().length) }, newText)];
					}
					return edits;
				},
			};
		},
	})
	if (options.supportedLanguages['css']) {
		plugins.push(
			createCssPlugin({
				async isFormattingEnabled(_document, context) {
					return await context.env.getConfiguration?.('html.format.enable') ?? true;
				},
				async getLanguageSettings(document, context) {
					return {
						...await context.env.getConfiguration?.(document.languageId),
						validate: await context.env.getConfiguration?.('html.validate.styles') ?? true,
					};
				},
			}),
		);
	}
	if (options.supportedLanguages['javascript']) {
		const tsPlugins = createTypeScriptPlugins(ts, {
			async isFormattingEnabled(_document, context) {
				return await context.env.getConfiguration?.('html.format.enable') ?? true;
			},
			async isValidationEnabled(_document, context) {
				return await context.env.getConfiguration?.('html.validate.scripts') ?? true;
			},
		});
		const patchedDocuments = new WeakMap<TextDocument, [version: number, prefix: string, TextDocument]>();

		for (const tsPlugin of tsPlugins) {
			if (tsPlugin.name === 'typescript-syntactic') {
				plugins.push({
					...tsPlugin,
					create(context) {
						const base = tsPlugin.create(context);
						return {
							...base,
							async provideDocumentFormattingEdits(document, range, options, embeddedCodeContext, token) {
								if (isTsDocument(document)) {
									const [_version, prefix, newDocument] = getPatchedDocument(document);
									if (newDocument === document) {
										if (embeddedCodeContext) {
											embeddedCodeContext.initialIndentLevel = 0;
										}
										return await base.provideDocumentFormattingEdits?.(newDocument, range, options, embeddedCodeContext, token);
									}
									let newRange = { ...range };
									if (document.offsetAt(range.start) !== 0 && document.offsetAt(range.end) !== document.getText().length) {
										newRange.start = newDocument.positionAt(document.offsetAt(range.start) + prefix.length);
										newRange.end = newDocument.positionAt(document.offsetAt(range.end) + prefix.length);
									}
									else {
										newRange.end = newDocument.positionAt(newDocument.getText().length);
									}
									const edits = await base.provideDocumentFormattingEdits?.(newDocument, newRange, options, embeddedCodeContext, token);
									if (edits) {
										const modifiedEdits: TextEdit[] = [];
										for (const edit of edits) {
											if (edit.range.start.line === 0) {
												edit.range.start.character -= prefix.length;
											}
											if (edit.range.end.line === 0) {
												edit.range.end.character -= prefix.length;
											}
											if (edit.range.start.character < 0 || edit.range.end.character < 0) {
												continue;
											}
											modifiedEdits.push(edit);
										}
										return modifiedEdits;
									}
								}
								return undefined;
							},
						};
					},
				})
			}
			else {
				plugins.push(tsPlugin);
			}
		}
		plugins.push(
			createJsonPlugin({
				async isFormattingEnabled(_document, context) {
					return await context.env.getConfiguration?.('html.format.enable') ?? true;
				},
				async getLanguageSettings(context) {
					return {
						...await context.env.getConfiguration?.('json'),
						validate: await context.env.getConfiguration?.('html.validate.scripts') ?? true,
					};
				},
			}),
		);

		function getPatchedDocument(document: TextDocument) {
			let patchedDocument = patchedDocuments.get(document);
			if (!patchedDocument || patchedDocument[0] !== document.version) {
				const lines = document.getText().split('\n');
				if (lines.length && !lines[0].trim() && !lines[lines.length - 1].trim()) { // wrap with {...} if is multi-line block
					const prefix = '{';
					const suffix = '}';
					const newText = prefix + document.getText() + suffix;
					const newDocument = TextDocument.create(document.uri, document.languageId, document.version, newText);
					patchedDocument = [document.version, prefix, newDocument];
				}
				else {
					patchedDocument = [document.version, '', document];
				}
				patchedDocuments.set(document, patchedDocument);
			}
			return patchedDocument;
		}
	}
	return plugins;
}
