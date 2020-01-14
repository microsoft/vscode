/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { IEditorRegistry, EditorDescriptor, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

import { TerminalEditor } from './editor';
import { TerminalEditorInput } from './editorInput';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';

const NEW_TERMINAL_COMMAND_ID = 'vs.workbench.contrib.editorTerminals.newTerminal';

CommandsRegistry.registerCommand(NEW_TERMINAL_COMMAND_ID, async (accessor) => {
	const editorService = accessor.get(IEditorService);
	const instService = accessor.get(IInstantiationService);
	const termService = accessor.get(ITerminalService);

	const termInstance = termService.createTerminal({
		hideFromUser: true
	});

	await termInstance.waitForTitle();
	await editorService.openEditor(instService.createInstance(TerminalEditorInput, termInstance));
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: NEW_TERMINAL_COMMAND_ID,
		category: 'Terminals',
		title: 'New Editor Terminal'
	}
});

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(TerminalEditor, TerminalEditor.ID, 'Terminal Editor'),
	[new SyncDescriptor(TerminalEditorInput)]
);

