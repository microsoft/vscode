/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createServiceIdentifier } from '../../../../../util/common/services';
import { Disposable, IDisposable } from '../../../../../util/vs/base/common/lifecycle';
import { IRange } from './textDocument';

export interface IPCitationDetail {
	license: string;
	url: string;
}

export interface IPDocumentCitation {
	inDocumentUri: string;
	offsetStart: number;
	offsetEnd: number;
	version?: number;
	location?: IRange;
	matchingText?: string;
	details: IPCitationDetail[];
}

export const ICompletionsCitationManager = createServiceIdentifier<ICompletionsCitationManager>('ICompletionsCitationManager');
export interface ICompletionsCitationManager {
	readonly _serviceBrand: undefined;

	register(): IDisposable;
	handleIPCodeCitation(citation: IPDocumentCitation): Promise<void>;
}

export class NoOpCitationManager implements ICompletionsCitationManager {
	declare _serviceBrand: undefined;

	register() { return Disposable.None; }

	async handleIPCodeCitation(citation: IPDocumentCitation): Promise<void> {
		// Do nothing
	}
}