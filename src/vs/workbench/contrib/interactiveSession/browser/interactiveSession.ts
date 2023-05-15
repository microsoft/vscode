/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IInteractiveSlashCommand } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IInteractiveResponseViewModel, IInteractiveSessionViewModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IInteractiveSessionWidgetService = createDecorator<IInteractiveSessionWidgetService>('interactiveSessionWidgetService');

export interface IInteractiveSessionWidgetService {

	readonly _serviceBrand: undefined;

	/**
	 * Returns the most recently focused widget if any.
	 */
	readonly lastFocusedWidget: IInteractiveSessionWidget | undefined;

	/**
	 * Returns whether a view was successfully revealed.
	 */
	revealViewForProvider(providerId: string): Promise<IInteractiveSessionWidget | undefined>;

	getWidgetByInputUri(uri: URI): IInteractiveSessionWidget | undefined;
}

export interface IInteractiveSessionCodeBlockInfo {
	codeBlockIndex: number;
	element: IInteractiveResponseViewModel;
	focus(): void;
}

export type IInteractiveSessionWidgetViewContext = { viewId: string } | { resource: boolean };

export interface IInteractiveSessionWidget {
	readonly onDidChangeViewModel: Event<void>;
	readonly viewContext: IInteractiveSessionWidgetViewContext;
	readonly viewModel: IInteractiveSessionViewModel | undefined;
	readonly inputEditor: ICodeEditor;
	readonly providerId: string;

	acceptInput(query?: string): void;
	focusLastMessage(): void;
	focusInput(): void;
	getSlashCommands(): Promise<IInteractiveSlashCommand[] | undefined>;
	getCodeBlockInfoForEditor(uri: URI): IInteractiveSessionCodeBlockInfo | undefined;
	getCodeBlockInfosForResponse(response: IInteractiveResponseViewModel): IInteractiveSessionCodeBlockInfo[];
}

export interface IInteractiveSessionViewPane {
	clear(): void;
}
