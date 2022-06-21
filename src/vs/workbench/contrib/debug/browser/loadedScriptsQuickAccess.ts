/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { matchesFuzzy } from 'vs/base/common/filters';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IPickerQuickAccessItem, PickerQuickAccessProvider } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { LOADED_SCRIPTS_QUICK_PICK_PREFIX } from 'vs/workbench/contrib/debug/browser/debugCommands';
import { IDebugService, IDebugSession } from 'vs/workbench/contrib/debug/common/debug';
import { Source } from 'vs/workbench/contrib/debug/common/debugSource';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class LoadedScriptQuickAccess extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	constructor(
		@IDebugService private readonly _debugService: IDebugService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super(LOADED_SCRIPTS_QUICK_PICK_PREFIX, { canAcceptInBackground: true });
	}

	protected _getLabelName(source: Source) {
		const posOfForwardSlash = source.name.lastIndexOf('/');
		const posOfBackSlash = source.name.lastIndexOf('\\');

		const delimeterPos = posOfForwardSlash > posOfBackSlash ? posOfForwardSlash : posOfBackSlash;
		const label = source.name.substring(delimeterPos + 1);
		return label;
	}

	protected _getPicksFromSession(session: IDebugSession, filter: string): Promise<Array<IPickerQuickAccessItem | IQuickPickSeparator>> {

		return new Promise((resolve, reject) => {
			const items: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];
			items.push({ type: 'separator', label: session.name });
			session?.getLoadedSources().then((sources: Source[]) => {

				sources?.forEach((element: Source) => {
					const pick = this._createPick(element, filter);
					if (pick) {
						items.push(pick);
					}

				});
				resolve(items);
			});
		});
	}

	protected async _getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): Promise<Array<IPickerQuickAccessItem | IQuickPickSeparator>> {
		const loadedScriptPicks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];

		const sessions = this._debugService.getModel().getSessions(true);

		const picks = await Promise.all(
			sessions.map((session) => {
				return this._getPicksFromSession(session, filter);
			})
		);

		for (const row of picks) {
			for (const elem of row) {
				loadedScriptPicks.push(elem);
			}
		}
		return loadedScriptPicks;
	}

	private _createPick(source: Source, filter: string): IPickerQuickAccessItem | undefined {
		const iconId = Codicon.file.id;

		const label = `$(${iconId}) ${this._getLabelName(source)}`;

		const highlights = matchesFuzzy(filter, label, true);
		if (highlights) {
			return {
				label,
				description: source.name,
				highlights: { label: highlights },
				accept: (keyMod, event) => {
					if (source.available) {
						source.openInEditor(this._editorService, { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 });
					}
				}
			};
		}
		return undefined;
	}
}
