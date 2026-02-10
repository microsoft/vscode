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
import { autorun, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { nativeHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IStatusbarService, StatusbarAlignment } from '../../../../services/statusbar/browser/statusbar.js';
import { AI_STATS_SETTING_ID } from '../settingIds.js';
import type { AiStatsFeature } from './aiStatsFeature.js';
import { ChartViewMode, createAiStatsChart, ISessionData } from './aiStatsChart.js';
import './media.css';

export class AiStatsStatusBar extends Disposable {
	public static readonly hot = createHotClass(this);

	constructor(
		private readonly _aiStatsFeature: AiStatsFeature,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
		@ICommandService private readonly _commandService: ICommandService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
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
						this._sendHoverTelemetry();
						store.clear();
						const elem = createAiStatsHover({
							data: this._aiStatsFeature,
							onOpenSettings: () => openSettingsCommand({ ids: [AI_STATS_SETTING_ID] }).run(this._commandService),
						});
						return elem.keepUpdated(store).element;
					},
					markdownNotSupportedFallback: undefined,
				},
				content: statusBarItem.element,
			}, 'aiStatsStatusBar', StatusbarAlignment.RIGHT, 100));
		}));
	}

	private _sendHoverTelemetry(): void {
		this._telemetryService.publicLog2<{
			aiRate: number;
		}, {
			owner: 'hediet';
			comment: 'Fired when the AI stats status bar hover tooltip is shown';
			aiRate: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The current AI rate percentage' };
		}>(
			'aiStatsStatusBar.hover',
			{
				aiRate: this._aiStatsFeature.aiRate.get(),
			}
		);
	}


	private _createStatusBar() {
		return n.div({
			style: {
				height: '100%',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				marginLeft: '3px',
				marginRight: '3px',
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
						borderWidth: '1px',
						borderStyle: 'solid',
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
								backgroundColor: 'currentColor',
							}
						})
					])
				]
			)
		]);
	}
}

export interface IAiStatsHoverData {
	readonly aiRate: IObservable<number>;
	readonly acceptedInlineSuggestionsToday: IObservable<number>;
	readonly sessions: IObservable<readonly ISessionData[]>;
}

export interface IAiStatsHoverOptions {
	readonly data: IAiStatsHoverData;
	readonly onOpenSettings?: () => void;
}

export function createAiStatsHover(options: IAiStatsHoverOptions) {
	const chartViewMode = observableValue<ChartViewMode>('chartViewMode', 'days');
	const aiRatePercent = options.data.aiRate.map(r => `${Math.round(r * 100)}%`);

	const createToggleButton = (mode: ChartViewMode, tooltip: string, icon: ThemeIcon) => {
		return derived(reader => {
			const currentMode = chartViewMode.read(reader);
			const isActive = currentMode === mode;

			return n.div({
				class: ['chart-toggle-button', isActive ? 'active' : ''],
				style: {
					padding: '2px 4px',
					borderRadius: '3px',
					cursor: 'pointer',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
				},
				onclick: () => {
					chartViewMode.set(mode, undefined);
				},
				title: tooltip,
			}, [
				n.div({
					class: ThemeIcon.asClassName(icon),
					style: { fontSize: '14px' }
				})
			]);
		});
	};

	return n.div({
		class: 'ai-stats-status-bar',
	}, [
		n.div({
			class: 'header',
			style: {
				minWidth: '280px',
			}
		},
			[
				n.div({ style: { flex: 1 } }, [localize('aiStatsStatusBarHeader', "AI Usage Statistics")]),
				n.div({ style: { marginLeft: 'auto' } }, options.onOpenSettings
					? actionBar([
						{
							action: {
								id: 'aiStats.statusBar.settings',
								label: '',
								enabled: true,
								run: options.onOpenSettings,
								class: ThemeIcon.asClassName(Codicon.gear),
								tooltip: localize('aiStats.statusBar.configure', "Configure")
							},
							options: { icon: true, label: false, hoverDelegate: nativeHoverDelegate }
						}
					])
					: [])
			]
		),

		n.div({ style: { display: 'flex' } }, [
			n.div({ style: { flex: 1, paddingRight: '4px' } }, [
				localize('text1', "AI vs Typing Average: {0}", aiRatePercent.get()),
			]),
		]),
		n.div({ style: { flex: 1, paddingRight: '4px' } }, [
			localize('text2', "Accepted inline suggestions today: {0}", options.data.acceptedInlineSuggestionsToday.get()),
		]),

		// Chart section
		n.div({
			style: {
				marginTop: '8px',
				borderTop: '1px solid var(--vscode-widget-border)',
				paddingTop: '8px',
			}
		}, [
			// Chart header with toggle
			n.div({
				class: 'header',
				style: {
					display: 'flex',
					alignItems: 'center',
					marginBottom: '4px',
				}
			}, [
				n.div({ style: { flex: 1 } }, [
					chartViewMode.map(mode =>
						mode === 'days'
							? localize('chartHeaderDays', "AI Rate by Day")
							: localize('chartHeaderSessions', "AI Rate by Session")
					)
				]),
				n.div({
					class: 'chart-view-toggle',
					style: { marginLeft: 'auto', display: 'flex', gap: '2px' }
				}, [
					createToggleButton('days', localize('viewByDays', "Days"), Codicon.calendar),
					createToggleButton('sessions', localize('viewBySessions', "Sessions"), Codicon.listFlat),
				])
			]),

			// Chart container
			derived(reader => {
				const sessions = options.data.sessions.read(reader);
				const viewMode = chartViewMode.read(reader);
				return n.div({
					ref: (container) => {
						const chart = createAiStatsChart({
							sessions,
							viewMode,
						});
						container.appendChild(chart);
					}
				});
			}),
		]),
	]);
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
