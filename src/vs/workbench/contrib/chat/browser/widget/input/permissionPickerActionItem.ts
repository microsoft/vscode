/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../common/constants.js';
import { IChatSessionProviderOptionItem, SessionType } from '../../../common/chatSessionsService.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ChatInputPickerActionViewItem, IChatInputPickerOptions } from './chatInputPickerActionItem.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { maybeConfirmElevatedPermissionLevel } from '../../../common/chatPermissionWarnings.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId, isAgentSandboxEnabledValue, type AgentSandboxEnabledSettingValue } from '../../../../../../platform/sandbox/common/settings.js';

export interface IExtensionPermissionState {
	/** Stable identifier for the contributing chat session type, used to namespace action ids. */
	readonly sessionType: string;
	readonly groupId: string;
	readonly items: readonly IChatSessionProviderOptionItem[];
	readonly selectedId: string | undefined;
}

export interface IPermissionPickerDelegate {
	readonly currentPermissionLevel: IObservable<ChatPermissionLevel>;
	readonly setPermissionLevel: (level: ChatPermissionLevel) => void;
	/**
	 * The ordered set of permission levels the picker should offer. When
	 * omitted, the built-in Default/Bypass/Autopilot set is used. Agent-host
	 * sessions override this to Default/Bypass (Autopilot lives on the
	 * orthogonal mode axis there).
	 */
	readonly availableLevels?: readonly ChatPermissionLevel[];
	/**
	 * The setting id the elevated-level warning dialog links to as "make this
	 * the default". Defaults to `chat.permissions.default`; agent-host sessions
	 * pass `chat.defaultConfiguration`.
	 */
	readonly defaultSettingKey?: string;
	/**
	 * When defined and returns a non-empty state, the picker shows the extension-contributed
	 * items in place of the built-in {@link ChatPermissionLevel} items.
	 */
	readonly getExtensionPermissions?: () => IExtensionPermissionState | undefined;
	readonly setExtensionPermission?: (groupId: string, item: IChatSessionProviderOptionItem) => void;
	readonly getPermissionLevelHover?: (level: ChatPermissionLevel, meta: IPermissionLevelMeta) => string | undefined;
	/**
	 * Whether the experimental "Sandboxing for terminal" toggle may be shown on
	 * the Default Approvals option. The toggle is specific to the local harness
	 * (which runs the built-in terminal tool); agent-host harnesses such as
	 * Copilot CLI and Claude Code do not implement this and never show it.
	 * Evaluated each time the picker opens so a harness switch is reflected.
	 */
	readonly isSandboxToggleApplicable?: () => boolean;
}

/** Default level set offered when a delegate does not specify {@link IPermissionPickerDelegate.availableLevels}. */
const DEFAULT_PERMISSION_LEVELS: readonly ChatPermissionLevel[] = [
	ChatPermissionLevel.Default,
	ChatPermissionLevel.AutoApprove,
	ChatPermissionLevel.Autopilot,
];

interface IPermissionLevelMeta {
	readonly id: string;
	readonly label: string;
	readonly shortLabel: string;
	readonly detail: string;
	readonly icon: ThemeIcon;
	readonly description: string;
	/** Elevated levels are disabled when enterprise policy turns off auto-approval and need a warning dialog. */
	readonly elevated: boolean;
}

function getPermissionLevelMeta(level: ChatPermissionLevel): IPermissionLevelMeta {
	switch (level) {
		case ChatPermissionLevel.AutoApprove:
			return {
				id: 'chat.permissions.autoApprove',
				label: localize('permissions.autoApprove', "Bypass Approvals"),
				shortLabel: localize('permissions.autoApprove.label', "Bypass Approvals"),
				detail: localize('permissions.autoApprove.subtext', "All tool calls are auto-approved"),
				icon: ThemeIcon.fromId(Codicon.warning.id),
				description: localize('permissions.autoApprove.description', "Auto-approve all tool calls and retry on errors"),
				elevated: true,
			};
		case ChatPermissionLevel.Autopilot:
			return {
				id: 'chat.permissions.autopilot',
				label: localize('permissions.autopilot', "Autopilot (Preview)"),
				shortLabel: localize('permissions.autopilot.label', "Autopilot (Preview)"),
				detail: localize('permissions.autopilot.subtext', "Autonomously iterates from start to finish"),
				icon: ThemeIcon.fromId(Codicon.rocket.id),
				description: localize('permissions.autopilot.description', "Auto-approve all tool calls and continue until the task is done. Autopilot may increase costs."),
				elevated: true,
			};
		case ChatPermissionLevel.Default:
		default:
			return {
				id: 'chat.permissions.default',
				label: localize('permissions.default', "Default Approvals"),
				shortLabel: localize('permissions.default.label', "Default Approvals"),
				detail: localize('permissions.default.subtext', "Copilot uses your configured settings"),
				icon: ThemeIcon.fromId(Codicon.shield.id),
				description: localize('permissions.default.description', "Use configured approval settings"),
				elevated: false,
			};
	}
}

/** Sanitize a free-form id segment so it is safe to embed in a stable action identifier. */
function sanitizeIdSegment(value: string): string {
	return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getSandboxEnabledSettingId(): AgentSandboxSettingId.AgentSandboxEnabled | AgentSandboxSettingId.AgentSandboxWindowsEnabled {
	return isWindows ? AgentSandboxSettingId.AgentSandboxWindowsEnabled : AgentSandboxSettingId.AgentSandboxEnabled;
}

export class PermissionPickerActionItem extends ChatInputPickerActionViewItem {

	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private _currentTooltip: string = '';
	private _hoverElement: HTMLElement | undefined;
	private readonly _hover = this._register(new MutableDisposable<IDisposable>());

	constructor(
		action: MenuItemAction,
		private readonly delegate: IPermissionPickerDelegate,
		pickerOptions: IChatInputPickerOptions,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService openerService: IOpenerService,
		@IStorageService storageService: IStorageService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		const isAutoApprovePolicyRestricted = () => configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				// If the active session contributes its own permission items, surface those instead
				// of the built-in Default/AutoApprove/Autopilot levels.
				const ext = delegate.getExtensionPermissions?.();
				if (ext && ext.items.length > 0) {
					const sessionTypeSeg = sanitizeIdSegment(ext.sessionType);
					const groupSeg = sanitizeIdSegment(ext.groupId);
					return ext.items.map(item => ({
						...action,
						id: `chat.permissions.ext.${sessionTypeSeg}.${groupSeg}.${sanitizeIdSegment(item.id)}`,
						label: item.name,
						detail: item.description,
						icon: item.icon,
						checked: ext.selectedId === item.id,
						enabled: !item.locked,
						tooltip: item.locked ? localize('permissions.ext.locked', "This option is locked") : '',
						hover: item.description ? { content: item.description } : undefined,
						run: async () => {
							delegate.setExtensionPermission?.(ext.groupId, item);
							if (this.element) {
								this.renderLabel(this.element);
							}
						},
					} satisfies IActionWidgetDropdownAction));
				}
				const currentLevel = delegate.currentPermissionLevel.get();
				const policyRestricted = isAutoApprovePolicyRestricted();
				const sandboxToggleEnabled = this.isSandboxToggleAvailable();
				const setSandboxEnabled = async (enableSandbox: boolean) => {
					if (this.isSandboxingEnabled() !== enableSandbox) {
						const value = enableSandbox ? AgentSandboxEnabledValue.On : AgentSandboxEnabledValue.Off;
						await configurationService.updateValue(getSandboxEnabledSettingId(), value);
					}
				};
				const levels = delegate.availableLevels ?? DEFAULT_PERMISSION_LEVELS;
				const actions: IActionWidgetDropdownAction[] = levels.map(level => {
					const meta = getPermissionLevelMeta(level);
					const disabledByPolicy = meta.elevated && policyRestricted;
					const hover = disabledByPolicy
						? localize('permissions.policyDescription', "Disabled by enterprise policy")
						: delegate.getPermissionLevelHover?.(level, meta) ?? meta.description;

					// The Default level carries an inline toggle that controls whether
					// terminal commands run inside a sandbox. The toggle is gated behind
					// an experimental setting.
					const inlineToggle = sandboxToggleEnabled && level === ChatPermissionLevel.Default
						? {
							label: localize('permissions.default.sandbox.toggle', "Sandboxing for terminal"),
							title: localize('permissions.default.sandbox.toggle.title', "Run terminal commands inside a sandbox that restricts file system and network access"),
							checked: this.isSandboxingEnabled(),
							onChange: (checked: boolean) => { void setSandboxEnabled(checked); },
						}
						: undefined;

					return {
						...action,
						id: meta.id,
						label: meta.label,
						detail: meta.detail,
						icon: meta.icon,
						checked: currentLevel === level,
						enabled: !disabledByPolicy,
						inlineToggle,
						tooltip: disabledByPolicy ? localize('permissions.policyDisabled', "Disabled by enterprise policy") : '',
						hover: {
							content: hover,
						},
						run: async () => {
							// Elevated levels show a one-time confirmation warning.
							if (meta.elevated && !await maybeConfirmElevatedPermissionLevel(level, this.dialogService, storageService, { defaultSettingKey: delegate.defaultSettingKey })) {
								return;
							}
							delegate.setPermissionLevel(level);
							if (this.element) {
								this.renderLabel(this.element);
							}
						},
					} satisfies IActionWidgetDropdownAction;
				});
				return actions;
			}
		};

		super(action, {
			actionProvider,
			actionBarActions: [{
				id: 'chat.permissions.learnMore',
				label: localize('permissions.learnMore', "Learn more about permissions"),
				tooltip: localize('permissions.learnMore', "Learn more about permissions"),
				class: undefined,
				enabled: true,
				run: async () => {
					const ext = delegate.getExtensionPermissions?.();
					const url = ext?.sessionType === SessionType.ClaudeCode
						? 'https://code.claude.com/docs/en/permission-modes#available-modes'
						: 'https://aka.ms/vscode/docs/permissions';
					await openerService.open(URI.parse(url));
				}
			}],
			reporter: { id: 'ChatPermissionPicker', name: 'ChatPermissionPicker', includeOptions: true },
			listOptions: { minWidth: 255, detailItemHeight: 44 },
		}, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);

		this._register(configurationService.onDidChangeConfiguration(e => {
			if ((e.affectsConfiguration(getSandboxEnabledSettingId()) || e.affectsConfiguration(ChatConfiguration.PermissionsSandboxToggleEnabled)) && this.element) {
				this.renderLabel(this.element);
			}
		}));
	}

	private isSandboxingEnabled(): boolean {
		const value = this.configurationService.getValue<AgentSandboxEnabledSettingValue | undefined>(getSandboxEnabledSettingId());
		return isAgentSandboxEnabledValue(value);
	}

	private isSandboxToggleSettingEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ChatConfiguration.PermissionsSandboxToggleEnabled) === true;
	}

	/**
	 * Whether the sandbox toggle should surface for the current harness: the
	 * experimental setting must be on and the delegate must opt in (only the
	 * local harness does).
	 */
	private isSandboxToggleAvailable(): boolean {
		return this.isSandboxToggleSettingEnabled() && this.delegate.isSandboxToggleApplicable?.() === true;
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		this.setAriaLabelAttributes(element);

		const ext = this.delegate.getExtensionPermissions?.();
		let icon: ThemeIcon;
		let label: string;
		let tooltip: string;
		const level = this.delegate.currentPermissionLevel.get();
		if (ext && ext.items.length > 0) {
			const selected = ext.items.find(i => i.id === ext.selectedId)
				?? ext.items.find(i => i.default)
				?? ext.items[0];
			icon = selected.icon ?? Codicon.lock;
			label = selected.name;
			tooltip = selected.description ?? selected.name;
		} else {
			const meta = getPermissionLevelMeta(level);
			icon = meta.icon;
			label = meta.shortLabel;
			tooltip = this.delegate.getPermissionLevelHover?.(level, meta) ?? meta.description;
			if (level === ChatPermissionLevel.Default && this.isSandboxToggleAvailable() && this.isSandboxingEnabled()) {
				label = localize('permissions.defaultSandboxed.label', "Default Approvals (Sandboxed)");
			}
		}

		const labelElements = [];
		labelElements.push(...renderLabelWithIcons(`$(${icon.id})`));
		labelElements.push(dom.$('span.chat-input-picker-label', undefined, label));

		dom.reset(element, ...labelElements);
		element.classList.toggle('warning', !ext && level === ChatPermissionLevel.Autopilot);
		element.classList.toggle('info', !ext && level === ChatPermissionLevel.AutoApprove);

		this._currentTooltip = tooltip;
		element.setAttribute('aria-label', !ext && this.delegate.getPermissionLevelHover
			? localize('permissions.ariaLabelWithDescription', "Permission picker, {0}, {1}", label, tooltip)
			: localize('permissions.ariaLabel', "Permission picker, {0}", label));
		// `renderLabel` can run against a fresh element on subsequent
		// `render()` calls (e.g. when the item moves into/out of overflow).
		// Re-wire the hover on the new element and dispose the previous
		// registration so it doesn't leak the old element.
		if (this._hoverElement !== element) {
			this._hoverElement = element;
			this._hover.value = this.hoverService.setupDelayedHover(element, () => ({ content: this._currentTooltip }));
		}
		return null;
	}

	public refresh(): void {
		if (this.element) {
			this.renderLabel(this.element);
		}
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this._onDidDispose.fire();
		super.dispose();
	}
}
