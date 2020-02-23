/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeLensContribution } from 'vs/editor/contrib/codelens/codelensController';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { INotificationService } from 'vs/platform/notification/common/notification';

export class ShowLensesInCurrentLineCommand extends Command {
	public runCommand(accessor: ServicesAccessor, args: any): void | Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const commandService = accessor.get(ICommandService);
		const notificationService = accessor.get(INotificationService);

		const focusedEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (!focusedEditor?.getSelection()?.isEmpty()) {
			return;
		}
		const lineNumber = focusedEditor.getSelection()?.positionLineNumber;
		const codelensController = focusedEditor.getContribution(CodeLensContribution.ID) as CodeLensContribution;

		const activeLensesWidgets = codelensController.getLenses().filter(lens => lens.getLineNumber() === lineNumber);

		const commandArguments: Map<string, any[] | undefined> = new Map();

		const picker = quickInputService.createQuickPick();
		const items: (IQuickPickItem | IQuickPickSeparator)[] = [];

		activeLensesWidgets.forEach(widget => {
			widget.getItems().forEach(codelens => {
				const command = codelens.symbol.command;
				if (!command) {
					return;
				}
				items.push({ id: command.id, label: command.title });

				commandArguments.set(command.id, command.arguments);
			});
		});


		console.log(items);
		picker.items = items;
		picker.canSelectMany = false;
		picker.onDidAccept(_ => {
			const selectedItems = picker.selectedItems;
			if (selectedItems.length === 1) {
				const id = selectedItems[0].id!;

				if (!id) {
					picker.hide();
					return;
				}

				commandService.executeCommand(id, ...(commandArguments.get(id) || [])).catch(err => notificationService.error(err));
			}
			picker.hide();
		});
		picker.show();
	}

}
