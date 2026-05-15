/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import type { SessionConfigPropertySchema } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { showMobilePickerSheet, IMobilePickerSheetItem, IMobilePickerSheetSearchSource } from '../../../../../browser/parts/mobile/mobilePickerSheet.js';
import { type IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { reportNewChatPickerClosed } from '../../../../chat/browser/newChatPickerTelemetry.js';
import { AgentHostSessionConfigPicker, getConfigIcon, IConfigPickerItem } from '../agentHostSessionConfigPicker.js';

/**
 * Phone variant of {@link AgentHostSessionConfigPicker} that routes the
 * Isolation and Branch pickers through a unified bottom sheet rather
 * than the desktop action-widget popup.
 *
 * Only instantiated on phone-layout viewports (see the factory in
 * `AgentHostSessionConfigPickersContribution`), so the overrides here are
 * unconditionally mobile and do not need an `isPhoneLayout` guard.
 */
export class MobileAgentHostSessionConfigPicker extends AgentHostSessionConfigPicker {

	/**
	 * On phone the chip lane has a fixed visual sequence — Default
	 * Approvals (rendered by a separate left-side picker), then Branch,
	 * then Worktree. Sort the known repo-config properties to that
	 * order; unknown properties fall through to schema-declared order
	 * after the known ones.
	 */
	protected override _orderProperties(properties: ReadonlyArray<[string, SessionConfigPropertySchema]>): ReadonlyArray<[string, SessionConfigPropertySchema]> {
		const order = new Map<string, number>([
			[SessionConfigKey.Branch, 0],
			[SessionConfigKey.Isolation, 1],
		]);
		return properties.slice().sort(([aKey], [bKey]) => {
			const a = order.get(aKey) ?? Number.MAX_SAFE_INTEGER;
			const b = order.get(bKey) ?? Number.MAX_SAFE_INTEGER;
			return a - b;
		});
	}

	/**
	 * Keep Branch and Isolation visible in running sessions even when
	 * the schema marks them non-mutable. Their value is informational
	 * — the user wants to see what the running session is using —
	 * and the chip renders as readonly via {@link _isReadOnlyChip}.
	 * All other properties defer to the base behavior (hide if
	 * non-mutable in a running session).
	 */
	protected override _shouldRenderProperty(property: string, schema: SessionConfigPropertySchema, isNewSession: boolean): boolean {
		const isUnifiedRepoProperty = property === SessionConfigKey.Isolation || property === SessionConfigKey.Branch;
		return isUnifiedRepoProperty || super._shouldRenderProperty(property, schema, isNewSession);
	}

	/**
	 * Mark non-mutable properties as readonly chips in running sessions
	 * so taps don't try to open a picker (which would no-op at the
	 * provider boundary). The schema's own `readOnly` flag still wins.
	 */
	protected override _isReadOnlyChip(property: string, schema: SessionConfigPropertySchema, isNewSession: boolean): boolean {
		return super._isReadOnlyChip(property, schema, isNewSession) || (!isNewSession && !schema.sessionMutable);
	}

	protected override async _showPicker(provider: IAgentHostSessionsProvider, sessionId: string, property: string, schema: SessionConfigPropertySchema, trigger: HTMLElement): Promise<void> {
		if (property === SessionConfigKey.Isolation || property === SessionConfigKey.Branch) {
			await this._showUnifiedRepoSheet(provider, sessionId, trigger);
			return;
		}

		return super._showPicker(provider, sessionId, property, schema, trigger);
	}

	private async _showUnifiedRepoSheet(provider: IAgentHostSessionsProvider, sessionId: string, trigger: HTMLElement): Promise<void> {
		const config = provider.getSessionConfig(sessionId);
		if (!config) {
			return;
		}

		const isolationSchema = config.schema.properties[SessionConfigKey.Isolation];
		const branchSchema = config.schema.properties[SessionConfigKey.Branch];

		const [isolationItems, branchItems] = await Promise.all([
			isolationSchema && !isolationSchema.readOnly
				? this._getItems(provider, sessionId, SessionConfigKey.Isolation, isolationSchema)
				: Promise.resolve([] as readonly IConfigPickerItem[]),
			branchSchema && !branchSchema.readOnly
				? this._getItems(provider, sessionId, SessionConfigKey.Branch, branchSchema)
				: Promise.resolve([] as readonly IConfigPickerItem[]),
		]);

		const isolationValue = config.values[SessionConfigKey.Isolation];
		const branchValue = config.values[SessionConfigKey.Branch];
		const sheetItems: IMobilePickerSheetItem[] = [];

		const idToConfig = new Map<string, { property: string; value: string; label: string; isPII: boolean }>();
		const registerId = (property: string, value: string, label: string, isPII: boolean): string => {
			const id = `repo-row-${idToConfig.size}`;
			idToConfig.set(id, { property, value, label, isPII });
			return id;
		};

		isolationItems.forEach((item, index) => {
			sheetItems.push({
				id: registerId(SessionConfigKey.Isolation, item.value, item.label, !!isolationSchema?.enumDynamic),
				label: item.label,
				description: item.description,
				icon: getConfigIcon(SessionConfigKey.Isolation, item.value),
				checked: item.value === isolationValue,
				sectionTitle: index === 0 ? (isolationSchema?.title ?? localize('mobileAgentHostSessionConfig.repoSheet.isolationSection', "Isolation")) : undefined,
			});
		});

		const branchSectionTitle = branchSchema?.title ?? localize('mobileAgentHostSessionConfig.repoSheet.branchSection', "Base Branch");
		if (!branchSchema?.enumDynamic) {
			branchItems.forEach((item, index) => {
				sheetItems.push({
					id: registerId(SessionConfigKey.Branch, item.value, item.label, !!branchSchema?.enumDynamic),
					label: item.label,
					description: item.description,
					icon: getConfigIcon(SessionConfigKey.Branch, item.value),
					checked: item.value === branchValue,
					sectionTitle: index === 0 ? branchSectionTitle : undefined,
				});
			});
		}

		if (sheetItems.length === 0 && !branchSchema?.enumDynamic) {
			return;
		}

		let search: IMobilePickerSheetSearchSource | undefined;
		if (branchSchema?.enumDynamic && !branchSchema.readOnly) {
			search = {
				placeholder: localize('mobileAgentHostSessionConfig.repoSheet.branchSearchPlaceholder', "Search branches"),
				ariaLabel: localize('mobileAgentHostSessionConfig.repoSheet.branchSearchAria', "Search base branches"),
				resultsSectionTitle: branchSectionTitle,
				emptyMessage: localize('mobileAgentHostSessionConfig.repoSheet.branchSearchEmpty', "No matching branches."),
				loadItems: async (query, token) => {
					const items = query
						? await this._getItems(provider, sessionId, SessionConfigKey.Branch, branchSchema, query)
						: branchItems;
					if (token.isCancellationRequested) {
						return [];
					}
					return items.map(item => ({
						id: registerId(SessionConfigKey.Branch, item.value, item.label, !!branchSchema.enumDynamic),
						label: item.label,
						description: item.description,
						icon: getConfigIcon(SessionConfigKey.Branch, item.value),
						checked: item.value === branchValue,
					}));
				},
			};
		}

		trigger.setAttribute('aria-expanded', 'true');
		await showMobilePickerSheet(
			this._layoutService.mainContainer,
			localize('mobileAgentHostSessionConfig.repoSheet.title', "Worktree"),
			sheetItems,
			{
				search,
				// Keep the sheet open on row taps so the user can adjust
				// both isolation mode and branch without reopening. Each
				// tap writes through immediately; Done just dismisses.
				stayOpenOnSelect: true,
				onDidSelect: (id) => {
					const selection = idToConfig.get(id);
					if (selection) {
						const beforeValue = provider.getSessionConfig(sessionId)?.values[selection.property];
						reportNewChatPickerClosed(this._telemetryService, {
							id: 'NewChatAgentHostSessionConfigPicker',
							name: `NewChatAgentHostSessionConfigPicker.${selection.property}`,
							optionIdBefore: typeof beforeValue === 'string' ? beforeValue : undefined,
							optionIdAfter: selection.value,
							optionLabelBefore: undefined,
							optionLabelAfter: selection.label,
							isPII: selection.isPII,
						});
						provider.setSessionConfigValue(sessionId, selection.property, selection.value).catch(() => { /* best-effort */ });
					}
				},
			},
		);
		trigger.setAttribute('aria-expanded', 'false');
		trigger.focus();
	}
}
