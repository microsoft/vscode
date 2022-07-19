/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from 'vscode-languageserver';
import * as md from 'vscode-markdown-languageservice';
import * as lsp from 'vscode-languageserver-types';

// From server
export const parseRequestType: RequestType<{ uri: string }, md.Token[], any> = new RequestType('markdown/parse');
export const readFileRequestType: RequestType<{ uri: string }, number[], any> = new RequestType('markdown/readFile');
export const statFileRequestType: RequestType<{ uri: string }, md.FileStat | undefined, any> = new RequestType('markdown/statFile');
export const readDirectoryRequestType: RequestType<{ uri: string }, [string, md.FileStat][], any> = new RequestType('markdown/readDirectory');
export const findFilesRequestTypes: RequestType<{}, string[], any> = new RequestType('markdown/findFiles');

// To server
export const getReferencesToFileInWorkspace = new RequestType<{ uri: string }, lsp.Location[], any>('markdown/getReferencesToFileInWorkspace');
