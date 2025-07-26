/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { n } from '../../../../../base/browser/dom.js';
import { ActionBar, IActionBarOptions, IActionOptions } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { createHotClass } from '../../../../../base/common/hotReloadHelpers.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IStatusbarService, StatusbarAlignment } from '../../../../services/statusbar/browser/statusbar.js';
import { AI_STATS_SETTING_ID } from '../settingIds.js';
import type { AiStatsFeature } from './aiStatsFeature.js';
import './media.css';

export class AiStatsStatusBar extends Disposable {
	public static readonly hot = createHotClass(AiStatsStatusBar);

	constructor(
		private readonly _aiStatsFeature: AiStatsFeature,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();

		this._register(autorun((reader) => {
			const statusBarItem = this._createStatusBar().keepUpdated(reader.store);

			const store = this._register(new DisposableStore());

			reader.store.add(this._statusbarService.addEntry({
				name: localize('inlineSuggestions', "Inline Suggestions"),
				ariaLabel: localize('inlineSuggestionsStatusBar', "Inline suggestions status bar"),
				text: '',
				tooltip: {
					element: async (_token) => {
						store.clear();
						const elem = this._createStatusBarHover();
						return elem.keepUpdated(store).element;
					},
					markdownNotSupportedFallback: undefined,
				},
				content: statusBarItem.element,
			}, 'aiStatsStatusBar', StatusbarAlignment.RIGHT, 100));
		}));
	}


	private _createStatusBar() {
		return n.div({
			style: {
				height: '100%',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
			}
		}, [
			n.div(
				{
					class: 'ai-stats-status-bar',
					style: {
						display: 'flex',
						flexDirection: 'column',

						width: 50,
						height: 6,

						borderRadius: 6,
						border: '1px solid var(--vscode-statusBar-foreground)',
					}
				},
				[
					n.div({
						style: {
							flex: 1,

							display: 'flex',
							overflow: 'hidden',

							borderRadius: 6,
							border: '1px solid transparent',
						}
					}, [
						n.div({
							style: {
								width: this._aiStatsFeature.aiRate.map(v => `${v * 100}%`),
								backgroundColor: 'var(--vscode-statusBar-foreground)',
							}
						})
					])
				]
			)
		]);
	}

	private _createStatusBarHover() {
		const aiRatePercent = this._aiStatsFeature.aiRate.map(r => `${Math.round(r * 100)}%`);

		return n.div({
			class: 'ai-stats-status-bar',
		}, [
			n.div({
				class: 'header',
				style: {
					fontWeight: 'bold',
					fontSize: '14px',
					marginBottom: '4px',
					minWidth: '200px',
				}
			},
				[
					n.div({ style: { flex: 1 } }, [localize('aiStatsStatusBarHeader', "AI Usage Statistics")]),
					n.div({ style: { marginLeft: 'auto' } }, actionBar([
						{
							action: {
								id: 'foo',
								label: '',
								enabled: true,
								run: () => openSettingsCommand({ ids: [AI_STATS_SETTING_ID] }).run(this._commandService),
								class: ThemeIcon.asClassName(Codicon.gear),
								tooltip: ''
							},
							options: { icon: true, label: false, }
						}
					]))
				]
			),

			n.div({ style: { display: 'flex' } }, [
				n.div({ style: { flex: 1 } }, [
					localize('text1', "Manual vs. AI typing ratio: {0}", aiRatePercent.get()),
				]),
				/*
				TODO: Write article that explains the ratio and link to it.

				n.div({ style: { marginLeft: 'auto' } }, actionBar([
					{
						action: {
							id: 'aiStatsStatusBar.openSettings',
							label: '',
							enabled: true,
							run: () => { },
							class: ThemeIcon.asClassName(Codicon.info),
							tooltip: ''
						},
						options: { icon: true, label: true, }
					}
				]))*/
			]),

			localize('text2', "Accepted inline suggestions today: {0}", this._aiStatsFeature.acceptedInlineSuggestionsToday.get()),
		]);
	}
}

function actionBar(actions: { action: IAction; options: IActionOptions }[], options?: IActionBarOptions) {
	return derived((_reader) => n.div({
		class: [],
		style: {
		},
		ref: elem => {
			const actionBar = _reader.store.add(new ActionBar(elem, options));
			for (const { action, options } of actions) {
				actionBar.push(action, options);
			}
		}
	}));
}

class CommandWithArgs {
	constructor(
		public readonly commandId: string,
		public readonly args: unknown[] = [],
	) { }

	public run(commandService: ICommandService): void {
		commandService.executeCommand(this.commandId, ...this.args);
	}
}

function openSettingsCommand(options: { ids?: string[] } = {}) {
	return new CommandWithArgs('workbench.action.openSettings', [{
		query: options.ids ? options.ids.map(id => `@id:${id}`).join(' ') : undefined,
	}]);
}
