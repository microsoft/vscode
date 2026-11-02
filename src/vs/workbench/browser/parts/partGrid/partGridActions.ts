/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Direction } from '../../../../base/browser/ui/grid/grid.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { getPartName } from '../editor/editorPartActions.js';
import { PartGrid } from './partGrid.js';

abstract class MovePartAction extends Action2 {

	constructor(id: string, title: ILocalizedString, private readonly direction: Direction) {
		super({
			id,
			title,
			category: Categories.View,
			precondition: IsSessionsWindowContext,
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		const editorGroupsService = accessor.get(IEditorGroupsService);

		const part = editorGroupsService.getPart(editorGroupsService.activeGroup);
		const found = PartGrid.findPart(part);
		if (found?.grid.moveCellInDirection(found.id, this.direction)) {
			status(localize('movedPart', "Moved {0}", getPartName(part)));
		}
	}
}

export class MovePartLeftAction extends MovePartAction {
	constructor() {
		super('workbench.action.movePartLeft', localize2('movePartLeft', "Move Part Left"), Direction.Left);
	}
}

export class MovePartRightAction extends MovePartAction {
	constructor() {
		super('workbench.action.movePartRight', localize2('movePartRight', "Move Part Right"), Direction.Right);
	}
}

export class MovePartUpAction extends MovePartAction {
	constructor() {
		super('workbench.action.movePartUp', localize2('movePartUp', "Move Part Up"), Direction.Up);
	}
}

export class MovePartDownAction extends MovePartAction {
	constructor() {
		super('workbench.action.movePartDown', localize2('movePartDown', "Move Part Down"), Direction.Down);
	}
}
