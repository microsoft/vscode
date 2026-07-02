/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IWorktreeGroupService } from '../../../services/worktrees/common/worktrees.js';
import { WorktreeLayoutController } from './worktreeLayoutController.js';
import { WorktreeSwitcherViewItem } from './worktreeSwitcherViewItem.js';
import { WorktreeTerminalContribution } from './worktreeTerminalContribution.js';

const WORKTREES_CATEGORY = localize2('worktrees.category', "Worktrees");

// Register the layout and terminal contributions — both must be live after
// the workbench has restored its initial editors so that working-set save/
// restore doesn't race with restore.
registerWorkbenchContribution2(WorktreeLayoutController.ID, WorktreeLayoutController, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(WorktreeTerminalContribution.ID, WorktreeTerminalContribution, WorkbenchPhase.AfterRestored);

// --- Commands ---

class SwitchWorktreeAction extends Action2 {
	static readonly ID = 'workbench.action.worktrees.switch';

	constructor() {
		super({
			id: SwitchWorktreeAction.ID,
			title: localize2('worktrees.switch', "Switch Worktree..."),
			category: WORKTREES_CATEGORY,
			icon: Codicon.listTree,
			f1: true,
			menu: [{
				// Renders inside the command center pill via the
				// `_renderCommandCenterToolbar` path; our custom view item
				// (registered below) provides the rich [icon] name / [branch]
				// content. Order < 999 places us before the project name.
				id: MenuId.CommandCenterCenter,
				order: 100,
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const worktreeService = accessor.get(IWorktreeGroupService);
		const quickInput = accessor.get(IQuickInputService);

		const worktrees = worktreeService.worktrees.get();
		if (worktrees.length === 0) {
			return;
		}

		const active = worktreeService.activeWorktree.get();
		const items: (IQuickPickItem & { uri: URI })[] = worktrees.map(w => ({
			label: w.label.get(),
			description: w.branch.get() ?? '',
			detail: w.uri.fsPath,
			uri: w.uri,
			picked: active?.uri.toString() === w.uri.toString(),
		}));

		const picked = await quickInput.pick(items, {
			placeHolder: localize('worktrees.switch.placeholder', "Select a worktree to open"),
			matchOnDescription: true,
			matchOnDetail: true,
		});

		if (picked) {
			await worktreeService.openWorktree(picked.uri);
		}
	}
}

class RefreshWorktreesAction extends Action2 {
	static readonly ID = 'workbench.action.worktrees.refresh';

	constructor() {
		super({
			id: RefreshWorktreesAction.ID,
			title: localize2('worktrees.refresh', "Refresh Worktrees"),
			category: WORKTREES_CATEGORY,
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const worktreeService = accessor.get(IWorktreeGroupService);
		await worktreeService.refresh();
	}
}

/**
 * Delegates to SCM's worktree creation flow. The git extension resolves the
 * active git repository, prompts for a base ref + branch, and runs
 * `git worktree add` — we refresh afterwards so the new worktree appears
 * immediately in our list.
 */
class CreateWorktreeAction extends Action2 {
	static readonly ID = 'workbench.action.worktrees.create';

	constructor() {
		super({
			id: CreateWorktreeAction.ID,
			title: localize2('worktrees.create', "New Worktree..."),
			category: WORKTREES_CATEGORY,
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const worktreeService = accessor.get(IWorktreeGroupService);
		await commandService.executeCommand('git.createWorktree');
		await worktreeService.refresh();
	}
}

/**
 * Delegates to SCM's worktree delete flow. The git extension prompts the
 * user to pick which worktree to remove from the repository and handles all
 * of git's edge cases (force-delete, locked worktrees, in-use branches).
 */
class DeleteWorktreeAction extends Action2 {
	static readonly ID = 'workbench.action.worktrees.delete';

	constructor() {
		super({
			id: DeleteWorktreeAction.ID,
			title: localize2('worktrees.delete', "Delete Worktree..."),
			category: WORKTREES_CATEGORY,
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const worktreeService = accessor.get(IWorktreeGroupService);
		await commandService.executeCommand('git.deleteWorktree');
		await worktreeService.refresh();
	}
}

registerAction2(SwitchWorktreeAction);
registerAction2(RefreshWorktreesAction);
registerAction2(CreateWorktreeAction);
registerAction2(DeleteWorktreeAction);

/**
 * Registers our custom view item for the worktree switcher inside the
 * command center pill. The pill renderer consults IActionViewItemService when
 * rendering items from MenuId.CommandCenterCenter, so this registration is
 * how we replace the default icon-button rendering with the rich
 * "[icon] worktree / [icon] branch" pill content.
 */
class WorktreeSwitcherRendering extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.worktrees.switcherRendering';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(actionViewItemService.register(MenuId.CommandCenterCenter, SwitchWorktreeAction.ID, (action, options) => {
			return instantiationService.createInstance(WorktreeSwitcherViewItem, action, options);
		}));
	}
}

registerWorkbenchContribution2(WorktreeSwitcherRendering.ID, WorktreeSwitcherRendering, WorkbenchPhase.BlockRestore);
