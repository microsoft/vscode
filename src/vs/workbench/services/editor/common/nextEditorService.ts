/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export const INextEditorService = createDecorator<INextEditorService>('nextEditorService');

// TODO@grid this should provide convinience methods on top of INextEditorGroupsService to make the 99%
// case of opening editors as simple as possible
// Candidates:
// - getVisibleEditors (text only?)
export interface INextEditorService {
	_serviceBrand: ServiceIdentifier<any>;
}

// Legacy code to find a position based on options
// private findPosition(input: EditorInput, options ?: EditorOptions, sideBySide ?: boolean, ratio ?: number[]): Position;
// 	private findPosition(input: EditorInput, options ?: EditorOptions, desiredPosition ?: Position, ratio ?: number[]): Position;
// 	private findPosition(input: EditorInput, options ?: EditorOptions, arg1 ?: any, ratio ?: number[]): Position {

// 	// With defined ratios, always trust the provided position
// 	if (ratio && types.isNumber(arg1)) {
// 		return arg1;
// 	}

// 	// No editor open
// 	const visibleEditors = this.getVisibleEditors();
// 	const activeEditor = this.getActiveEditor();
// 	if (visibleEditors.length === 0 || !activeEditor) {
// 		return Position.ONE; // can only be ONE
// 	}

// 	// Ignore revealIfVisible/revealIfOpened option if we got instructed explicitly to
// 	// * open at a specific index
// 	// * open to the side
// 	// * open in a specific group
// 	const skipReveal = (options && options.index) || arg1 === true /* open to side */ || typeof arg1 === 'number' /* open specific group */;

// 	// Respect option to reveal an editor if it is already visible
// 	if (!skipReveal && options && options.revealIfVisible) {
// 		const group = this.stacks.findGroup(input, true);
// 		if (group) {
// 			return this.stacks.positionOfGroup(group);
// 		}
// 	}

// 	// Respect option to reveal an editor if it is open (not necessarily visible)
// 	if (!skipReveal && (this.revealIfOpen /* workbench.editor.revealIfOpen */ || (options && options.revealIfOpened))) {
// 		const group = this.stacks.findGroup(input);
// 		if (group) {
// 			return this.stacks.positionOfGroup(group);
// 		}
// 	}

// 	// Position is unknown: pick last active or ONE
// 	if (types.isUndefinedOrNull(arg1) || arg1 === false) {
// 		const lastActivePosition = this.editorGroupsControl.getActivePosition();

// 		return lastActivePosition || Position.ONE;
// 	}

// 	// Position is sideBySide: Find position relative to active editor
// 	if (arg1 === true) {
// 		switch (activeEditor.position) {
// 			case Position.ONE:
// 				return Position.TWO;
// 			case Position.TWO:
// 				return Position.THREE;
// 			case Position.THREE:
// 				return null; // Cannot open to the side of the right/bottom most editor
// 		}

// 		return null; // Prevent opening to the side
// 	}

// 	// Position is provided, validate it
// 	if (arg1 === Position.THREE && visibleEditors.length === 1) {
// 		return Position.TWO;
// 	}

// 	return arg1;
// }