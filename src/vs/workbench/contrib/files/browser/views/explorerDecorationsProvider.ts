/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IDecorationsProvider, IDecorationData } from 'vs/workbench/services/decorations/browser/decorations';
import { listInvalidItemForeground } from 'vs/platform/theme/common/colorRegistry';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IExplorerService } from 'vs/workbench/contrib/files/common/files';

export class ExplorerDecorationsProvider implements IDecorationsProvider {
	readonly label: string = localize('label', "Explorer");
	private _onDidChange = new Emitter<URI[]>();
	private readonly toDispose = new DisposableStore();

	constructor(
		@IExplorerService private explorerService: IExplorerService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		this.toDispose.add(this._onDidChange);
		this.toDispose.add(contextService.onDidChangeWorkspaceFolders(e => {
			this._onDidChange.fire(e.changed.concat(e.added).map(wf => wf.uri));
		}));
		this.toDispose.add(explorerService.onDidChangeItem(change => {
			if (change.item) {
				this._onDidChange.fire([change.item.resource]);
			}
		}));
	}

	get onDidChange(): Event<URI[]> {
		return this._onDidChange.event;
	}

	provideDecorations(resource: URI): IDecorationData | undefined {
		const fileStat = this.explorerService.findClosest(resource);
		if (fileStat && fileStat.isRoot && fileStat.isError) {
			return {
				tooltip: localize('canNotResolve', "Can not resolve workspace folder"),
				letter: '!',
				color: listInvalidItemForeground,
			};
		}
		if (fileStat && fileStat.isSymbolicLink) {
			return {
				tooltip: localize('symbolicLlink', "Symbolic Link"),
				letter: '\u2937'
			};
		}

		return undefined;
	}

	dispose(): void {
		this.toDispose.dispose();
	}
}
