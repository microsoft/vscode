/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Token = require('markdown-it/lib/token');
import { RequestType } from 'vscode-languageclient';
import type * as lsp from 'vscode-languageserver-types';

// From server
export const parseRequestType: RequestType<{ uri: string }, Token[], any> = new RequestType('markdown/parse');
export const readFileRequestType: RequestType<{ uri: string }, number[], any> = new RequestType('markdown/readFile');
export const statFileRequestType: RequestType<{ uri: string }, { isDirectory: boolean } | undefined, any> = new RequestType('markdown/statFile');
export const readDirectoryRequestType: RequestType<{ uri: string }, [string, { isDirectory: boolean }][], any> = new RequestType('markdown/readDirectory');
export const findFilesRequestTypes = new RequestType<{}, string[], any>('markdown/findFiles');

// To server
export const getReferencesToFileInWorkspace = new RequestType<{ uri: string }, lsp.Location[], any>('markdown/getReferencesToFileInWorkspace');
