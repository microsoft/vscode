/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from 'vscode-languageserver';
import * as md from 'vscode-markdown-languageservice';

declare const TextDecoder: any;

export const parseRequestType: RequestType<{ uri: string }, md.Token[], any> = new RequestType('markdown/parse');

export const readFileRequestType: RequestType<{ uri: string }, number[], any> = new RequestType('markdown/readFile');

export const findFilesRequestTypes: RequestType<{}, string[], any> = new RequestType('markdown/findFiles');
