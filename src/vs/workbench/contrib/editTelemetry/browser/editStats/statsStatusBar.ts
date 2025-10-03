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
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { nativeHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IStatusbarService, StatusbarAlignment } from '../../../../services/statusbar/browser/statusbar.js';
import { IChatEntitlementService } from '../../../chat/common/chatEntitlementService.js';
import { STATS_SETTING_ID } from '../settingIds.js';
import type { StatsFeature } from './statsFeature.js';
import './media.css';

export class StatsStatusBar extends Disposable {
	public static readonly hot = createHotClass(StatsStatusBar);

	constructor(
		private readonly _statsFeature: StatsFeature,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
		@ICommandService private readonly _commandService: ICommandService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
	) {
		super();

		this._register(autorun((reader) => {
			const statusBarItem = this._createStatusBar().keepUpdated(reader.store);

			const store = this._register(new DisposableStore());

			reader.store.add(this._statusbarService.addEntry({
				name: localize('editorStats', "Editor Statistics"),
				ariaLabel: localize('editorStatsStatusBar', "Editor statistics status bar"),
				text: '',
				tooltip: {
					element: async (_token) => {
						this._sendHoverTelemetry();
						store.clear();
						const elem = this._createStatusBarHover();
						return elem.keepUpdated(store).element;
					},
					markdownNotSupportedFallback: undefined,
				},
				content: statusBarItem.element,
			}, 'statsStatusBar', StatusbarAlignment.RIGHT, 100));
		}));
	}

	private _sendHoverTelemetry(): void {
		const mode = this._configurationService.getValue<string>(STATS_SETTING_ID);
		this._telemetryService.publicLog2<{
			mode: string;
			aiRate?: number;
			premiumQuotaPercent?: number;
		}, {
			owner: 'hediet';
			comment: 'Fired when the stats status bar hover tooltip is shown';
			mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The stats mode being displayed' };
			aiRate?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The current AI rate percentage' };
			premiumQuotaPercent?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The premium quota percentage used' };
		}>(
			'statsStatusBar.hover',
			{
				mode,
				aiRate: mode === 'aiStats' ? this._statsFeature.aiRate.get() : undefined,
				premiumQuotaPercent: mode === 'premiumQuota' ? this._getPremiumQuotaPercent() : undefined,
			}
		);
	}

	private _getPremiumQuotaPercent(): number {
		const premiumQuota = this._chatEntitlementService.quotas.premiumChat;
		if (!premiumQuota || premiumQuota.unlimited) {
			return 0;
		}
		return 100 - (premiumQuota.percentRemaining ?? 0);
	}


	private _createStatusBar() {
		const mode = this._configurationService.getValue<string>(STATS_SETTING_ID);
		const percent = mode === 'premiumQuota'
			? derived(this, () => this._getPremiumQuotaPercent())
			: this._statsFeature.aiRate.map(v => v * 100);

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
					class: 'stats-status-bar',
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
								width: percent.map(v => `${v}%`),
								backgroundColor: 'currentColor',
							}
						})
					])
				]
			)
		]);
	}

	private _createStatusBarHover() {
		const mode = this._configurationService.getValue<string>(STATS_SETTING_ID);

		if (mode === 'premiumQuota') {
			return this._createPremiumQuotaHover();
		} else {
			return this._createAiStatsHover();
		}
	}

	private _createAiStatsHover() {
		const aiRatePercent = this._statsFeature.aiRate.map(r => `${Math.round(r * 100)}%`);

		return n.div({
			class: 'stats-status-bar',
		}, [
			n.div({
				class: 'header',
				style: {
					minWidth: '200px',
				}
			},
				[
					n.div({ style: { flex: 1 } }, [localize('aiStatsStatusBarHeader', "AI Usage Statistics")]),
					n.div({ style: { marginLeft: 'auto' } }, actionBar([
						{
							action: {
								id: 'stats.statusBar.settings',
								label: '',
								enabled: true,
								run: () => openSettingsCommand({ ids: [STATS_SETTING_ID] }).run(this._commandService),
								class: ThemeIcon.asClassName(Codicon.gear),
								tooltip: localize('stats.statusBar.configure', "Configure")
							},
							options: { icon: true, label: false, hoverDelegate: nativeHoverDelegate }
						}
					]))
				]
			),

			n.div({ style: { display: 'flex' } }, [
				n.div({ style: { flex: 1, paddingRight: '4px' } }, [
					localize('text1', "AI vs Typing Average: {0}", aiRatePercent.get()),
				]),
			]),
			n.div({ style: { flex: 1, paddingRight: '4px' } }, [
				localize('text2', "Accepted inline suggestions today: {0}", this._statsFeature.acceptedInlineSuggestionsToday.get()),
			]),
		]);
	}

	private _createPremiumQuotaHover() {
		const premiumQuota = this._chatEntitlementService.quotas.premiumChat;
		const percentUsed = this._getPremiumQuotaPercent();
		const remaining = premiumQuota?.remaining ?? 0;
		const total = premiumQuota?.total ?? 0;
		const unlimited = premiumQuota?.unlimited ?? false;

		return n.div({
			class: 'stats-status-bar',
		}, [
			n.div({
				class: 'header',
				style: {
					minWidth: '200px',
				}
			},
				[
					n.div({ style: { flex: 1 } }, [localize('premiumQuotaStatusBarHeader', "Copilot Premium Quota")]),
					n.div({ style: { marginLeft: 'auto' } }, actionBar([
						{
							action: {
								id: 'stats.statusBar.settings',
								label: '',
								enabled: true,
								run: () => openSettingsCommand({ ids: [STATS_SETTING_ID] }).run(this._commandService),
								class: ThemeIcon.asClassName(Codicon.gear),
								tooltip: localize('stats.statusBar.configure', "Configure")
							},
							options: { icon: true, label: false, hoverDelegate: nativeHoverDelegate }
						}
					]))
				]
			),

			n.div({ style: { flex: 1, paddingRight: '4px' } }, [
				unlimited
					? localize('premiumQuotaUnlimited', "Unlimited premium requests")
					: localize('premiumQuotaUsed', "Premium requests used: {0}% ({1} of {2})", Math.round(percentUsed), total - remaining, total),
			]),
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
