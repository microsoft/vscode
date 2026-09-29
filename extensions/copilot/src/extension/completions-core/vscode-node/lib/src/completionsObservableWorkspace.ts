/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DocumentId } from '../../../../../platform/inlineEdits/common/dataTypes/documentId';
import { IObservableDocument } from '../../../../../platform/inlineEdits/common/observableWorkspace';
import { IObservableWithChange } from '../../../../../util/vs/base/common/observableInternal';
import { URI } from '../../../../../util/vs/base/common/uri';
import { createDecorator as createServiceIdentifier } from '../../../../../util/vs/platform/instantiation/common/instantiation';

export const ICompletionsObservableWorkspace = createServiceIdentifier<ICompletionsObservableWorkspace>('ICompletionsObservableWorkspace');
export interface ICompletionsObservableWorkspace {
	readonly _serviceBrand: undefined;

	get openDocuments(): IObservableWithChange<readonly IObservableDocument[], { added: readonly IObservableDocument[]; removed: readonly IObservableDocument[] }>;

	getWorkspaceRoot(documentId: DocumentId): URI | undefined;

	getFirstOpenDocument(): IObservableDocument | undefined;

	getDocument(documentId: DocumentId): IObservableDocument | undefined;
}
