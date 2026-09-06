/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IDropdownMenuActionViewItemOptions } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IAction } from '../../../../base/common/actions.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { autorun, derivedOpts } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { reset } from '../../../../base/browser/dom.js';
import { ISCMService } from '../../../../workbench/contrib/scm/common/scm.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';

export class SyncChangesActionViewItem extends ActionViewItem {
	private _tooltip: string | undefined;
	private readonly _labelUpdateDisposable = this._register(new MutableDisposable());

	constructor(
		action: IAction,
		options: IDropdownMenuActionViewItemOptions | undefined,
		@ISCMService private readonly scmService: ISCMService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
	) {
		super(undefined, action, { ...options, icon: false, label: true });
	}

	protected override getTooltip(): string | undefined {
		return this._tooltip ?? super.getTooltip();
	}

	protected override updateLabel(): void {
		this._labelUpdateDisposable.clear();

		if (!this.label) {
			return;
		}

		this.label.classList.add('sync-changes-action-view-item');

		const workspaceFolder = this.contextService.getWorkspace().folders[0];
		const repository = workspaceFolder
			? Iterable.find(this.scmService.repositories, repo => isEqual(repo.provider.rootUri, workspaceFolder.uri))
			: undefined;

		const syncActionDetailsObs = derivedOpts<{ title: string; tooltip?: string } | undefined>({ equalsFn: structuralEquals },
			reader => {
				const commands = repository?.provider.statusBarCommands.read(reader);

				// We are reusing the sync status bar command that is being contributed by the git extension as that is
				// being updated based on the latest state as well as while the action is running. Long term, we need to
				// find a better way to identify and reuse this command.
				const syncCommand = commands?.find(c => c.title.startsWith('$(sync)') || c.title.startsWith('$(sync~spin)'));

				return syncCommand
					? {
						title: syncCommand.title,
						tooltip: syncCommand.tooltip
					}
					: undefined;
			});

		this._labelUpdateDisposable.value = autorun(reader => {
			const syncActionDetails = syncActionDetailsObs.read(reader);

			reset(this.label!, ...(syncActionDetails ? renderLabelWithIcons(syncActionDetails.title) : []));

			this._tooltip = syncActionDetails?.tooltip;
			this.updateTooltip();
		});
	}
}
