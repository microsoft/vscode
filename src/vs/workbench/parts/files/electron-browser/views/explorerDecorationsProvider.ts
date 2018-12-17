/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { Model } from 'vs/workbench/parts/files/common/explorerModel';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IDecorationsProvider, IDecorationData } from 'vs/workbench/services/decorations/browser/decorations';
import { listInvalidItemForeground } from 'vs/platform/theme/common/colorRegistry';
import { IDisposable } from 'vscode-xterm';
import { dispose } from 'vs/base/common/lifecycle';

export class ExplorerDecorationsProvider implements IDecorationsProvider {
	readonly label: string = localize('label', "Explorer");
	private _onDidChange = new Emitter<URI[]>();
	private toDispose: IDisposable[];

	constructor(
		private model: Model,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		this.toDispose = [];
		this.toDispose.push(contextService.onDidChangeWorkspaceFolders(e => {
			this._onDidChange.fire(e.changed.concat(e.added).map(wf => wf.uri));
		}));
	}

	get onDidChange(): Event<URI[]> {
		return this._onDidChange.event;
	}

	changed(uris: URI[]): void {
		this._onDidChange.fire(uris);
	}

	provideDecorations(resource: URI): IDecorationData | undefined {
		const fileStat = this.model.findClosest(resource);
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

	dispose(): IDisposable[] {
		return dispose(this.toDispose);
	}
}
