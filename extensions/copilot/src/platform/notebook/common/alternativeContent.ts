/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelChat, NotebookDocument, Uri } from 'vscode';
import { findCell } from '../../../util/common/notebooks';
import { createServiceIdentifier } from '../../../util/common/services';
import { Range } from '../../../vscodeTypes';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { modelPrefersJsonNotebookRepresentation } from '../../endpoint/common/chatModelCapabilities';
import { IChatEndpoint } from '../../networking/common/networking';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { BaseAlternativeNotebookContentProvider } from './alternativeContentProvider';
import { AlternativeJsonNotebookContentProvider, isJsonContent } from './alternativeContentProvider.json';
import { AlternativeTextNotebookContentProvider } from './alternativeContentProvider.text';
import { AlternativeXmlNotebookContentProvider, isXmlContent } from './alternativeContentProvider.xml';

export type AlternativeContentFormat = 'xml' | 'text' | 'json';

export function getAlternativeNotebookDocumentProvider(kind: 'xml' | 'text' | 'json'): BaseAlternativeNotebookContentProvider {
	switch (kind) {
		case 'xml':
			return new AlternativeXmlNotebookContentProvider();
		case 'text':
			return new AlternativeTextNotebookContentProvider();
		case 'json':
			return new AlternativeJsonNotebookContentProvider();
		default:
			throw new Error(`Unsupported kind '${kind}'`);
	}
}

/**
 * Given the content, determine the format of the content.
 */
export function inferAlternativeNotebookContentFormat(content: string): AlternativeContentFormat {
	if (isXmlContent(content)) {
		return 'xml';
	}
	if (isJsonContent(content)) {
		return 'json';
	}
	return 'text';
}


export const IAlternativeNotebookContentService = createServiceIdentifier<IAlternativeNotebookContentService>('IAlternativeNotebookContentService');

export interface IAlternativeNotebookContentService {
	readonly _serviceBrand: undefined;
	getFormat(options: LanguageModelChat | IChatEndpoint | undefined): AlternativeContentFormat;
	create(format: AlternativeContentFormat): BaseAlternativeNotebookContentProvider;
}

export class AlternativeNotebookContentService implements IAlternativeNotebookContentService {
	declare readonly _serviceBrand: undefined;
	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
	) {
		//
	}
	getFormat(options: LanguageModelChat | IChatEndpoint | undefined): AlternativeContentFormat {
		// GPT 4.1 supports apply_patch, such models work best with JSON format (doesn't have great support for XML yet, thats being worked on).
		if (options && modelPrefersJsonNotebookRepresentation(options)) {
			return 'json';
		}

		return this.configurationService.getExperimentBasedConfig(ConfigKey.Advanced.NotebookAlternativeDocumentFormat, this.experimentationService);
	}

	create(format: AlternativeContentFormat): BaseAlternativeNotebookContentProvider {
		return getAlternativeNotebookDocumentProvider(format);
	}
}

export function getAltNotebookRange(range: Range, cellUri: Uri, notebook: NotebookDocument, format: AlternativeContentFormat) {
	// If we have a range for cell, then translate that from notebook cell range to alternative range.
	const cell = findCell(cellUri, notebook);
	if (!cell) {
		return undefined;
	}
	const doc = getAlternativeNotebookDocumentProvider(format).getAlternativeDocument(notebook);
	return new Range(
		doc.fromCellPosition(cell, range.start),
		doc.fromCellPosition(cell, range.end),
	);
}
