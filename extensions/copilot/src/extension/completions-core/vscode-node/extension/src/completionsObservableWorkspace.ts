/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSCodeWorkspace } from '../../../../inlineEdits/vscode-node/parts/vscodeWorkspace';
import { ICompletionsObservableWorkspace } from '../../lib/src/completionsObservableWorkspace';

export class CompletionsObservableWorkspace extends VSCodeWorkspace implements ICompletionsObservableWorkspace {
	declare _serviceBrand: undefined;
}