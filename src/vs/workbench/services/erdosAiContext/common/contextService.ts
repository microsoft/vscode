/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';

export interface IContextItem {
	id: string;
	name: string;
	type: 'file' | 'directory' | 'chat' | 'docs';
	path?: string;
	startLine?: number;
	endLine?: number;
	content?: string; // Pre-extracted content
	conversationId?: number;
	topic?: string;
	language?: 'R' | 'Python';
	timestamp: Date;
}

export interface IDirectContextItem {
	type: 'file' | 'directory' | 'chat' | 'docs';
	name: string;
	path?: string;
	content?: string | string[];
	start_line?: number;
	end_line?: number;
	id?: string;
	summary?: string;
	topic?: string;
	language?: 'R' | 'Python';
	markdown?: string;
}

export const IContextService = createDecorator<IContextService>('erdosAiContextService');

export interface IContextService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeContext: Event<IContextItem[]>;
	
	addFileContext(uri: URI, content?: string, startLine?: number, endLine?: number): Promise<boolean>;
	addChatContext(conversationId: number, name?: string): boolean;
	addDocsContext(topic: string, name?: string, language?: 'R' | 'Python'): boolean;
	removeContextItem(id: string): boolean;
	generateDirectContextData(): Promise<IDirectContextItem[]>;
	getContextItems(): IContextItem[];
	createResolverContext(): any;
	prepareContextForBackend(messages: any[], vscodeReferences?: any[]): Promise<any>;
}
