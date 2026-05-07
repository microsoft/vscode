/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseAlternativeNotebookContentProvider } from './alternativeContentProvider';
import { AlternativeContentFormat, getAlternativeNotebookDocumentProvider, IAlternativeNotebookContentService } from './alternativeContent';

export class MockAlternativeNotebookContentService implements IAlternativeNotebookContentService {
	declare readonly _serviceBrand: undefined;
	constructor(public format: AlternativeContentFormat = 'json'
	) {
		//
	}
	getFormat(): AlternativeContentFormat {
		return this.format;
	}

	create(format: AlternativeContentFormat): BaseAlternativeNotebookContentProvider {
		return getAlternativeNotebookDocumentProvider(format);
	}
}
