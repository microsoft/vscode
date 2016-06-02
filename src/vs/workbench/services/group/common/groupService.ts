/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {Position} from 'vs/platform/editor/common/editor';

export enum GroupArrangement {
	MINIMIZE_OTHERS,
	EVEN_WIDTH
}

export var IEditorGroupService = createDecorator<IEditorGroupService>('editorGroupService');

/**
 * The editor service allows to open editors and work on the active
 * editor input and models.
 */
export interface IEditorGroupService {
	serviceId : ServiceIdentifier<any>;

	/**
	 * Keyboard focus the editor group at the provided position.
	 */
	focusGroup(position: Position): void;

	/**
	 * Activate the editor group at the provided position without moving focus.
	 */
	activateGroup(position: Position): void;

	/**
	 * Allows to move the editor group from one position to another.
	 */
	moveGroup(from: Position, to: Position): void;

	/**
	 * Allows to arrange editor groups according to the GroupArrangement enumeration.
	 */
	arrangeGroups(arrangement: GroupArrangement): void;
}