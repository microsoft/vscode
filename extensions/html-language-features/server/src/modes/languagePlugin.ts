/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ExtraServiceScript, LanguagePlugin, VirtualCode } from '@volar/language-server';
import { forEachEmbeddedCode } from '@volar/language-core';
import type * as ts from 'typescript';
import { getLanguageService } from 'vscode-html-languageservice';
import { getDocumentRegions } from './embeddedSupport';

const htmlLanguageService = getLanguageService();

export const htmlLanguagePlugin: LanguagePlugin = {
	createVirtualCode(_fileId, languageId, snapshot) {
		if (languageId === 'html') {
			return createHtmlVirtualCode(snapshot);
		}
		return undefined;
	},
	updateVirtualCode(_fileId, _virtualCode, newSnapshot) {
		return createHtmlVirtualCode(newSnapshot);
	},
	typescript: {
		extraFileExtensions: [],
		getScript() {
			return undefined;
		},
		getExtraScripts(fileName, rootCode) {
			const extraScripts: ExtraServiceScript[] = [];
			for (const code of forEachEmbeddedCode(rootCode)) {
				if (code.id.startsWith('javascript_') && !code.id.endsWith('_format')) {
					extraScripts.push({
						fileName: fileName + '.' + code.id.split('_')[1] + '.js',
						code,
						extension: '.js',
						scriptKind: 1,
					});
				}
				else if (code.id.startsWith('typescript_') && !code.id.endsWith('_format')) {
					extraScripts.push({
						fileName: fileName + '.' + code.id.split('_')[1] + '.ts',
						code,
						extension: '.ts',
						scriptKind: 3,
					});
				}
			}
			return extraScripts;
		},
	},
};

function createHtmlVirtualCode(snapshot: ts.IScriptSnapshot): VirtualCode {
	const root: VirtualCode = {
		id: 'root',
		languageId: 'html',
		snapshot,
		mappings: [{
			sourceOffsets: [0],
			generatedOffsets: [0],
			lengths: [snapshot.getLength()],
			data: { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: true },
		}],
	};
	const documentRegions = getDocumentRegions(htmlLanguageService, snapshot.getText(0, snapshot.getLength()));
	const languageIdIndexes: Record<string, number> = {};
	for (const documentRegion of documentRegions.getEmbeddedRegions()) {
		if (!documentRegion.languageId) {
			continue;
		}
		languageIdIndexes[documentRegion.languageId] ??= 0;
		const isJsOrTs = documentRegion.languageId === 'javascript' || documentRegion.languageId === 'typescript';
		root.embeddedCodes ??= [];
		root.embeddedCodes.push({
			languageId: documentRegion.languageId,
			id: documentRegion.languageId + '_' + languageIdIndexes[documentRegion.languageId],
			snapshot: {
				getText(start, end) {
					return documentRegion.content.substring(start, end);
				},
				getLength() {
					return documentRegion.content.length;
				},
				getChangeRange() {
					return undefined;
				},
			},
			mappings: [{
				sourceOffsets: [documentRegion.start],
				generatedOffsets: [documentRegion.generatedStart],
				lengths: [documentRegion.length],
				data: documentRegion.attributeValue
					? { verification: false, completion: true, semantic: true, navigation: true, structure: true, format: false }
					: { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: !isJsOrTs },
			}],
		});
		if (documentRegion.languageId === 'javascript' || documentRegion.languageId === 'typescript') {
			let prefix = '{';
			let suffix = '}';
			const lines = documentRegion.content.split('\n');
			if (lines.length) {
				if (lines[0].trim()) {
					prefix += '; ';
				}
				if (lines[lines.length - 1].trim()) {
					suffix = '; ' + suffix;
				}
			}
			const content = `${prefix}${documentRegion.content}${suffix}`;
			const generatedStart = documentRegion.generatedStart + prefix.length;
			root.embeddedCodes ??= [];
			root.embeddedCodes.push({
				languageId: documentRegion.languageId,
				id: documentRegion.languageId + '_' + languageIdIndexes[documentRegion.languageId] + '_format',
				snapshot: {
					getText(start, end) {
						return content.substring(start, end);
					},
					getLength() {
						return content.length;
					},
					getChangeRange() {
						return undefined;
					},
				},
				mappings: [{
					sourceOffsets: [documentRegion.start],
					generatedOffsets: [generatedStart],
					lengths: [documentRegion.length],
					data: { verification: false, completion: false, semantic: false, navigation: false, structure: false, format: true },
				}],
			});
		}
		languageIdIndexes[documentRegion.languageId]++;
	}
	return root;
}
