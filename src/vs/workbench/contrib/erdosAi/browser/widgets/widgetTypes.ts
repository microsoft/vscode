/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';

/**
 * Widget interaction handlers for React components
 */
export interface IErdosAiWidgetHandlers {
	onAccept?: (messageId: number, content: string) => void;
	onCancel?: (messageId: number) => void;
	onAllowList?: (messageId: number, content: string) => void;
}

/**
 * Monaco editor services for widget integration
 */
export interface IMonacoWidgetServices {
	instantiationService: IInstantiationService;
	modelService: IModelService;
	languageService: ILanguageService;
}

/**
 * Widget function call information for React components
 */
export interface IErdosAiWidgetInfo {
	messageId: number;
	requestId: string;
	functionCallType: 'search_replace' | 'run_console_cmd' | 'run_terminal_cmd' | 'delete_file' | 'run_file';
	filename?: string;
	initialContent?: string;
	autoAccept?: boolean; // Flag to auto-accept without user interaction
	diffStats?: {
		added: number;
		deleted: number;
	};
	startLine?: number;
	endLine?: number;
	language?: 'python' | 'r'; // Language for console commands
	monacoServices?: IMonacoWidgetServices;
}
