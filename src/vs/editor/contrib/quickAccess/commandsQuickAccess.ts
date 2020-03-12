/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractCommandsQuickAccessProvider, ICommandQuickPick } from 'vs/platform/quickinput/browser/commandsQuickAccess';
import { IEditor } from 'vs/editor/common/editorCommon';

export interface IEditorCommandsQuickAccessOptions {
	alias: {
		enable: boolean;
		verify: boolean;
	}
}

export abstract class AbstractEditorCommandsQuickAccessProvider extends AbstractCommandsQuickAccessProvider {

	constructor(private options?: IEditorCommandsQuickAccessOptions) {
		super();
	}

	/**
	 * Subclasses to provide the current active editor control.
	 */
	abstract activeTextEditorControl: IEditor | undefined;

	protected getCodeEditorCommandPicks(): ICommandQuickPick[] {
		const activeTextEditorControl = this.activeTextEditorControl;
		if (!activeTextEditorControl) {
			return [];
		}

		const editorCommandPicks: ICommandQuickPick[] = [];
		for (const editorAction of activeTextEditorControl.getSupportedActions()) {
			const label = editorAction.label || editorAction.id;
			const alias: string | undefined = this.verifyAlias(editorAction.alias, label, editorAction.id);

			editorCommandPicks.push({
				label,
				commandId: editorAction.id,
				detail: alias
			});
		}

		return editorCommandPicks;
	}

	protected verifyAlias(alias: string | undefined, label: string, commandId: string): string | undefined {
		if (this.options?.alias.verify && alias && alias !== label) {
			console.warn(`Command alias '${label}' and label '${alias}' differ (${commandId})`);
		}

		if (!this.options?.alias.enable) {
			return undefined; // we unset the alias if it is not enabled
		}

		return alias;
	}
}
