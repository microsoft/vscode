/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventHelper, EventLike } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import type { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { AgentFusionPhaseStatus } from '../../../../../../platform/agentHost/common/meta/agentToolCallMeta.js';
import { getSubagentIsActive } from '../../../common/chatService/chatService.js';
import { getLanguageModelDisplayNameWithSubscriptionSource } from '../../../common/languageModelSourcePresentation.js';
import { getLanguageModelDisplayNameWithProvider, ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { OpenSubagentChatActionViewItem, SubagentPillContext, type IOpenSubagentChatContext, type SubagentChatStatus } from './chatSubagentOpenChat.js';

export interface ISubagentPhaseContext extends SubagentPillContext {
	readonly presentation: 'phase';
	readonly phaseStatus?: AgentFusionPhaseStatus;
	readonly activityLabel?: string;
	/** The phase's own chat, holding its tool calls and intermediate messages, when the host provides one. */
	readonly chatResource?: string;
	readonly isChatAvailable?: boolean;
}

function isSubagentPhaseContext(context: unknown): context is ISubagentPhaseContext {
	if (!context || typeof context !== 'object') {
		return false;
	}
	const candidate: { presentation?: unknown } = context;
	return candidate.presentation === 'phase';
}

/** A phase summary using the subagent pill's visual presentation; it opens the phase chat when there is one. */
export class FusionPhasePillActionViewItem extends OpenSubagentChatActionViewItem {
	private _modelCache: { modelId: string; parentSessionResource: string; model: ILanguageModelChatMetadataAndIdentifier | undefined; name: string | undefined } | undefined;
	/** The action bar's last request, applied once a chat makes the pill navigable. */
	private _focusable: boolean | undefined;

	protected override get navigationContext(): IOpenSubagentChatContext | undefined {
		const context = this.pillContext;
		return context?.chatResource ? { ...context, chatResource: context.chatResource } : undefined;
	}

	protected override get pillContext(): ISubagentPhaseContext | undefined {
		return isSubagentPhaseContext(this._context) ? this._context : undefined;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		const refreshModel = () => {
			this._modelCache = undefined;
			this._update();
		};
		this._register(this.languageModelsService.onDidChangeLanguageModels(refreshModel));
		this._register(this.languageModelsService.onDidChangeLanguageModelVendors(refreshModel));
	}

	override onClick(event: EventLike): void {
		if (this.navigationContext) {
			super.onClick(event);
			return;
		}
		EventHelper.stop(event, true);
	}

	override focus(): void {
		if (this.navigationContext) {
			super.focus();
		}
	}

	override setFocusable(focusable: boolean): void {
		this._focusable = focusable;
		if (this.navigationContext) {
			super.setFocusable(focusable);
		}
	}

	protected override updateEnabled(): void {
		super.updateEnabled();
		if (!this.element) {
			return;
		}
		if (this.navigationContext) {
			if (this._focusable !== undefined) {
				super.setFocusable(this._focusable);
			}
			return;
		}
		this.element.setAttribute('role', 'group');
		this.element.removeAttribute('aria-disabled');
		this.element.removeAttribute('tabindex');
		this.element.draggable = false;
	}

	/**
	 * A phase reports its model by the id the host uses, which is not the id the model is registered
	 * under. The registered model is the one with that id among the models of the session's type.
	 */
	private get _registeredModel(): { readonly model: ILanguageModelChatMetadataAndIdentifier | undefined; readonly name: string | undefined } | undefined {
		const context = this.pillContext;
		const rawModelId = context?.modelId;
		const parentSessionResource = context?.parentSessionResource;
		if (!rawModelId || !parentSessionResource) {
			return undefined;
		}
		if (this._modelCache?.modelId !== rawModelId || this._modelCache.parentSessionResource !== parentSessionResource) {
			const sessionType = getChatSessionType(URI.parse(parentSessionResource));
			let model: ILanguageModelChatMetadataAndIdentifier | undefined;
			for (const identifier of this.languageModelsService.getLanguageModelIds()) {
				const metadata = this.languageModelsService.lookupLanguageModel(identifier);
				if (metadata?.targetChatSessionType === sessionType && (metadata.id === rawModelId || identifier === rawModelId)) {
					model = { identifier, metadata };
					break;
				}
			}
			this._modelCache = {
				modelId: rawModelId, parentSessionResource, model,
				name: model && getLanguageModelDisplayNameWithSubscriptionSource(model, getLanguageModelDisplayNameWithProvider(model, this.languageModelsService)),
			};
		}
		return this._modelCache;
	}

	protected override get model(): ILanguageModelChatMetadataAndIdentifier | undefined {
		return this._registeredModel?.model;
	}

	protected override get modelName(): string | undefined {
		const context = this.pillContext;
		return this._registeredModel?.name ?? context?.modelName ?? context?.modelId;
	}

	protected override get showModel(): boolean {
		return true;
	}

	protected override get isActive(): boolean {
		return !!this.pillContext && getSubagentIsActive(this.pillContext) === true;
	}

	protected override get activityLabel(): string {
		return this.pillContext?.activityLabel ?? super.activityLabel;
	}

	protected override get status(): SubagentChatStatus | undefined {
		const status = this.pillContext?.phaseStatus;
		return status === 'succeeded' ? 'completed' : status;
	}

	protected override get statusIcon(): ThemeIcon {
		return this.status === 'failed' ? Codicon.error : this.status === 'cancelled' ? Codicon.circleSlash : Codicon.check;
	}

	protected override get duration(): number | undefined {
		const duration = super.duration;
		return duration !== undefined && Number.isFinite(duration) && duration >= 0 ? duration : undefined;
	}

	protected override get showDuration(): boolean {
		return this.isActive || this.duration !== undefined;
	}

	private get statusLabel(): string | undefined {
		switch (this.status) {
			case 'running': return localize('chat.phase.running', "Phase is running");
			case 'completed': return localize('chat.phase.completed', "Phase completed");
			case 'failed': return localize('chat.phase.failed', "Phase failed");
			case 'cancelled': return localize('chat.phase.cancelled', "Phase cancelled");
			default: return undefined;
		}
	}

	protected override getTooltip(): string {
		const modelName = this.modelName;
		return [
			localize('chat.phase.title', "Copilot Fusion phase: {0}", this.pillContext?.title ?? this.action.label),
			this.statusLabel,
			modelName ? localize('chat.phase.modelTooltip', "Model: {0}", modelName) : undefined,
		].filter(Boolean).join('\n');
	}

	protected override updateAriaLabel(): void {
		this.element?.setAttribute('aria-label', [this.getTooltip().replace(/\n/g, '. '), this.activityAriaLabel, this.durationLabel].filter(Boolean).join('. '));
	}
}
