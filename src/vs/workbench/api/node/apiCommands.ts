/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import * as vscode from 'vscode';
import * as typeConverters from 'vs/workbench/api/node/extHostTypeConverters';
import { CommandsRegistry, ICommandService, ICommandHandler } from 'vs/platform/commands/common/commands';
import { Position as EditorPosition, ITextEditorOptions } from 'vs/platform/editor/common/editor';

// -----------------------------------------------------------------
// The following commands are registered on both sides separately.
//
// We are trying to maintain backwards compatibility for cases where
// API commands are encoded as markdown links, for example.
// -----------------------------------------------------------------

export interface ICommandsExecutor {
	executeCommand<T>(id: string, ...args: any[]): Thenable<T>;
}

function adjustHandler(handler: (executor: ICommandsExecutor, ...args: any[]) => any): ICommandHandler {
	return (accessor, ...args: any[]) => {
		return handler(accessor.get(ICommandService), ...args);
	};
}

export class PreviewHTMLAPICommand {
	public static ID = 'vscode.previewHtml';
	public static execute(executor: ICommandsExecutor, uri: URI, position?: vscode.ViewColumn, label?: string, options?: any): Thenable<any> {
		return executor.executeCommand('_workbench.previewHtml',
			uri,
			typeof position === 'number' && typeConverters.ViewColumn.from(position),
			label,
			options
		);
	}
}
CommandsRegistry.registerCommand(PreviewHTMLAPICommand.ID, adjustHandler(PreviewHTMLAPICommand.execute));

export class OpenFolderAPICommand {
	public static ID = 'vscode.openFolder';
	public static execute(executor: ICommandsExecutor, uri?: URI, forceNewWindow?: boolean): Thenable<any> {
		if (!uri) {
			return executor.executeCommand('_files.pickFolderAndOpen', forceNewWindow);
		}

		return executor.executeCommand('_files.windowOpen', [uri.fsPath], forceNewWindow);
	}
}
CommandsRegistry.registerCommand(OpenFolderAPICommand.ID, adjustHandler(OpenFolderAPICommand.execute));

export class DiffAPICommand {
	public static ID = 'vscode.diff';
	public static execute(executor: ICommandsExecutor, left: URI, right: URI, label: string, options?: vscode.TextDocumentShowOptions): Thenable<any> {
		return executor.executeCommand('_workbench.diff', [
			left, right,
			label,
			undefined,
			typeConverters.TextEditorOptions.from(options),
			options ? typeConverters.ViewColumn.from(options.viewColumn) : undefined
		]);
	}
}
CommandsRegistry.registerCommand(DiffAPICommand.ID, adjustHandler(DiffAPICommand.execute));

export class OpenAPICommand {
	public static ID = 'vscode.open';
	public static execute(executor: ICommandsExecutor, resource: URI, columnOrOptions?: vscode.ViewColumn | vscode.TextDocumentShowOptions): Thenable<any> {
		let options: ITextEditorOptions;
		let column: EditorPosition;

		if (columnOrOptions) {
			if (typeof columnOrOptions === 'number') {
				column = typeConverters.ViewColumn.from(columnOrOptions);
			} else {
				options = typeConverters.TextEditorOptions.from(columnOrOptions);
				column = typeConverters.ViewColumn.from(columnOrOptions.viewColumn);
			}
		}

		return executor.executeCommand('_workbench.open', [
			resource,
			options,
			column
		]);
	}
}
CommandsRegistry.registerCommand(OpenAPICommand.ID, adjustHandler(OpenAPICommand.execute));

export class RemoveFromRecentlyOpenedAPICommand {
	public static ID = 'vscode.removeFromRecentlyOpened';
	public static execute(executor: ICommandsExecutor, path: string): Thenable<any> {
		return executor.executeCommand('_workbench.removeFromRecentlyOpened', path);
	}
}
CommandsRegistry.registerCommand(RemoveFromRecentlyOpenedAPICommand.ID, adjustHandler(RemoveFromRecentlyOpenedAPICommand.execute));
