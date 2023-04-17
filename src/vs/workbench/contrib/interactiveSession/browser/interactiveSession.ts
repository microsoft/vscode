/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IInteractiveSlashCommand } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IInteractiveSessionViewModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';
import { Event } from 'vs/base/common/event';

export interface IInteractiveSessionWidget {
	readonly onDidChangeViewModel: Event<void>;
	readonly viewModel: IInteractiveSessionViewModel | undefined;
	readonly inputEditor: ICodeEditor;

	acceptInput(query?: string): void;
	clear(): void;
	focusLastMessage(): void;
	focusInput(): void;
	getSlashCommands(): Promise<IInteractiveSlashCommand[] | undefined>;
}
