/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { Model } from 'vs/workbench/parts/files/common/explorerModel';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IDecorationsProvider, IDecorationData } from 'vs/workbench/services/decorations/browser/decorations';
import { listInvalidItemForeground } from 'vs/platform/theme/common/colorRegistry';

export class ExplorerDecorationsProvider implements IDecorationsProvider {
	readonly label: string = localize('label', "Explorer");
	private _onDidChange = new Emitter<URI[]>();

	constructor(
		private model: Model,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		contextService.onDidChangeWorkspaceFolders(e => {
			this._onDidChange.fire(e.changed.map(wf => wf.uri));
		});
	}

	get onDidChange(): Event<URI[]> {
		return this._onDidChange.event;
	}

	provideDecorations(resource: URI): IDecorationData {
		const fileStat = this.model.findClosest(resource);
		if (fileStat && fileStat.nonexistentRoot) {
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
}
