/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CodeMapping, VirtualCode } from '@volar/language-server';
import type * as ts from 'typescript';
import { getLanguageService, LanguageService } from 'vscode-html-languageservice';
import { EmbeddedRegion, getDocumentRegions, HTMLDocumentRegions } from './embeddedSupport';

let htmlLanguageService: LanguageService | undefined;

export class HTMLVirtualCode implements VirtualCode {
	documentRegions: HTMLDocumentRegions;
	id = 'root';
	languageId = 'html';
	mappings: CodeMapping[];
	embeddedCodes: VirtualCode[];

	constructor(
		public snapshot: ts.IScriptSnapshot
	) {
		this.documentRegions = getDocumentRegions(
			htmlLanguageService ??= getLanguageService(),
			snapshot.getText(0, snapshot.getLength())
		);
		this.mappings = [{
			sourceOffsets: [0],
			generatedOffsets: [0],
			lengths: [snapshot.getLength()],
			data: { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: true },
		}];
		this.embeddedCodes = [
			...getScriptVirtualCodes(this.documentRegions),
			...getOtherLanguageVirtualCodes(this.documentRegions),
		];
	}
}

function* getScriptVirtualCodes(documentRegions: HTMLDocumentRegions): Generator<VirtualCode> {
	const mappings: CodeMapping[] = [];
	const importedScripts = documentRegions.getImportedScripts();
	const globalScripts = documentRegions
		.getEmbeddedRegions()
		.filter(isGlobalScript);

	let text = '';

	for (const script of importedScripts) {
		if (script.startsWith('http://') || script.startsWith('https://') || script.startsWith('//')) {
			continue;
		}
		else if (script.startsWith('file://')) {
			text += `import '${script.slice('file://'.length)}';\n`;
		}
		else if (script.startsWith('/') || script.startsWith('./') || script.startsWith('../') || script.includes(':/')) {
			text += `import '${script}';\n`;
		} else {
			text += `import './${script}';\n`;
		}
	}

	if (importedScripts.length) {
		text += '\n';
	}

	for (let i = 0; i < globalScripts.length; i++) {
		const globalScript = globalScripts[i];
		mappings.push({
			sourceOffsets: [globalScript.start],
			generatedOffsets: [text.length + globalScript.generatedStart],
			lengths: [globalScript.length],
			data: { verification: true, completion: true, semantic: true, navigation: true },
		});
		text += globalScript.content;
		if (i < globalScripts.length - 1) {
			text += '\n;\n';
		}
		yield {
			languageId: globalScript.languageId!,
			id: 'global_script_' + i + '_syntax',
			snapshot: {
				getText(start, end) {
					return globalScript.content.substring(start, end);
				},
				getLength() {
					return globalScript.content.length;
				},
				getChangeRange() {
					return undefined;
				},
			},
			mappings: [{
				sourceOffsets: [globalScript.start],
				generatedOffsets: [globalScript.generatedStart],
				lengths: [globalScript.length],
				data: { structure: true, format: true },
			}],
		};
	}

	yield {
		languageId: 'javascript',
		id: 'global_script',
		snapshot: {
			getText(start, end) {
				return text.substring(start, end);
			},
			getLength() {
				return text.length;
			},
			getChangeRange() {
				return undefined;
			},
		},
		mappings,
	};
}

function* getOtherLanguageVirtualCodes(documentRegions: HTMLDocumentRegions): Generator<VirtualCode> {
	const indexMap: Record<string, number> = {};
	for (const documentRegion of documentRegions.getEmbeddedRegions()) {
		if (!documentRegion.languageId || isGlobalScript(documentRegion)) {
			continue;
		}
		indexMap[documentRegion.tagName] ??= 0;
		const index = indexMap[documentRegion.tagName]++;
		yield {
			languageId: documentRegion.languageId,
			id: documentRegion.tagName + '_' + index,
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
					? { verification: true, completion: true, semantic: true, navigation: true, structure: true }
					: { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: true },
			}],
		};
	}
}

function isGlobalScript(region: EmbeddedRegion) {
	return region.languageId === 'javascript' && !region.moduleScript;
}
