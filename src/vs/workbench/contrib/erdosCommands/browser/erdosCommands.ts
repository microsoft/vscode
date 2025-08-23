/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';

/**
 * Execute current line or selection in console
 */
export class ExecuteCurrentLineAction extends Action2 {
	static readonly ID = 'erdos.executeCurrentLine';

	constructor() {
		super({
			id: ExecuteCurrentLineAction.ID,
			title: { value: localize('executeCurrentLine', 'Execute Current Line'), original: 'Execute Current Line' },
			category: 'Developer',
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				when: EditorContextKeys.editorTextFocus
			},
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		const editorService = accessor.get(IEditorService);
		
		const activeEditor = editorService.activeTextEditorControl;
		if (!activeEditor) {
			notificationService.warn('No active editor found');
			return;
		}

		// Get current line or selection
		const selection = activeEditor.getSelection();
		if (!selection) {
			return;
		}

		const model = activeEditor.getModel();
		if (!model || !('getLineContent' in model)) {
			return;
		}

		const textModel = model as any; // Cast to access text model methods
		const text = selection.isEmpty() 
			? textModel.getLineContent(selection.startLineNumber)
			: textModel.getValueInRange(selection);

		// For now, just show what would be executed
		notificationService.info(`Would execute: ${text.trim()}`);
	}
}

/**
 * Execute current line and advance to next
 */
export class ExecuteAndAdvanceAction extends Action2 {
	static readonly ID = 'erdos.executeAndAdvance';

	constructor() {
		super({
			id: ExecuteAndAdvanceAction.ID,
			title: { value: localize('executeAndAdvance', 'Execute and Advance'), original: 'Execute and Advance' },
			category: 'Developer',
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Shift | KeyCode.Enter,
				when: EditorContextKeys.editorTextFocus
			},
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		const editorService = accessor.get(IEditorService);
		
		const activeEditor = editorService.activeTextEditorControl;
		if (!activeEditor) {
			notificationService.warn('No active editor found');
			return;
		}

		// Execute current line first
		await new ExecuteCurrentLineAction().run(accessor);

		// Then advance cursor
		const selection = activeEditor.getSelection();
		if (selection) {
			const newPosition = selection.getEndPosition().delta(1, 0);
			activeEditor.setPosition(newPosition);
		}
	}
}

/**
 * Focus editor pane
 */
export class FocusEditorAction extends Action2 {
	static readonly ID = 'erdos.focusEditor';

	constructor() {
		super({
			id: FocusEditorAction.ID,
			title: { value: localize('focusEditor', 'Focus Editor'), original: 'Focus Editor' },
			category: 'Developer',
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Digit1
			},
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const activeEditor = editorService.activeTextEditorControl;
		
		if (activeEditor) {
			activeEditor.focus();
		}
	}
}

/**
 * Insert R assignment operator
 */
export class InsertAssignmentOperatorAction extends Action2 {
	static readonly ID = 'erdos.insertAssignmentOperator';

	constructor() {
		super({
			id: InsertAssignmentOperatorAction.ID,
			title: { value: localize('insertAssignmentOperator', 'Insert Assignment Operator'), original: 'Insert Assignment Operator' },
			category: 'Developer',
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyCode.Minus,
				when: EditorContextKeys.editorTextFocus
			},
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const activeEditor = editorService.activeTextEditorControl;
		
		if (activeEditor && 'executeEdits' in activeEditor) {
			const selection = activeEditor.getSelection();
			if (selection) {
				(activeEditor as any).executeEdits('erdos-assignment', [{
					range: selection,
					text: ' <- '
				}]);
			}
		}
	}
}

// Register all actions
registerAction2(ExecuteCurrentLineAction);
registerAction2(ExecuteAndAdvanceAction);
registerAction2(FocusEditorAction);
registerAction2(InsertAssignmentOperatorAction);
