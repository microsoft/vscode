/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IntervalTimer } from '../../../../base/common/async.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatModeKind } from '../common/constants.js';
import { IChatWidget } from './chat.js';

export const IChatProcessingTipsService = createDecorator<IChatProcessingTipsService>('chatProcessingTipsService');

export interface IChatProcessingTipsService {
	readonly _serviceBrand: undefined;

	/**
	 * Start showing rotating tips in the chat input placeholder.
	 * Tips rotate every 30 seconds and include mode-specific tips and model upgrade recommendations.
	 * @param widget The chat widget to show tips for
	 */
	startTips(widget: IChatWidget): void;

	/**
	 * Stop showing tips and reset the input placeholder.
	 */
	stopTips(): void;
}

// Tip rotation interval: 30 seconds
const TIP_ROTATION_INTERVAL_MS = 30000;

// Mode-specific tips
const AGENT_TIPS = [
	localize('tip.agent.terminal', "Copilot can run terminal commands"),
	localize('tip.agent.tests', "Try asking Copilot to run your tests"),
	localize('tip.agent.commit', "Copilot can commit changes"),
];

const EDIT_TIPS = [
	localize('tip.edit.codebase', "Use #codebase to find files automatically"),
	localize('tip.edit.file', "Reference specific files with #file"),
];

const ASK_TIPS = [
	localize('tip.ask.workspace', "Ask about code in your workspace"),
	localize('tip.ask.atWorkspace', "Try @workspace for project-wide questions"),
];

// Model upgrade recommendations (for Copilot models only)
const MODEL_UPGRADE_TIPS: Record<string, string> = {
	'gpt-4o': localize('tip.upgrade.gpt4o', "Consider upgrading to GPT-4.5 for improved performance"),
	'gpt-4.1': localize('tip.upgrade.gpt41', "Try a newer model like Claude Sonnet 4 for better coding"),
};

/**
 * Parses a Copilot model identifier to extract the model name.
 * Returns undefined for BYOK (bring your own key) models.
 *
 * @param identifier The model identifier (e.g., "copilot/gpt-4o")
 * @returns The model name (e.g., "gpt-4o") or undefined for BYOK models
 */
function parseCopilotModelId(identifier: string): string | undefined {
	if (identifier.startsWith('copilot/')) {
		return identifier.substring(8);
	}
	return undefined;
}

/**
 * Gets tips for the specified chat mode.
 */
function getTipsForMode(modeKind: ChatModeKind): readonly string[] {
	switch (modeKind) {
		case ChatModeKind.Agent:
			return AGENT_TIPS;
		case ChatModeKind.Edit:
			return EDIT_TIPS;
		case ChatModeKind.Ask:
			return ASK_TIPS;
		default:
			return [];
	}
}

/**
 * Gets the model upgrade tip for the specified model identifier, if applicable.
 */
function getModelUpgradeTip(modelIdentifier: string | undefined): string | undefined {
	if (!modelIdentifier) {
		return undefined;
	}
	const modelName = parseCopilotModelId(modelIdentifier);
	if (!modelName) {
		// BYOK model, no upgrade tip
		return undefined;
	}
	return MODEL_UPGRADE_TIPS[modelName];
}

export class ChatProcessingTipsService extends Disposable implements IChatProcessingTipsService {
	declare readonly _serviceBrand: undefined;

	private readonly _timer = this._register(new IntervalTimer());
	private readonly _widgetDisposable = this._register(new MutableDisposable<IDisposable>());
	private _tipIndex = 0;
	private _tipPool: string[] = [];
	private _widget: IChatWidget | undefined;

	constructor() {
		super();
	}

	startTips(widget: IChatWidget): void {
		// Clear any existing tips
		this.stopTips();

		this._widget = widget;
		const modelId = widget.input.selectedLanguageModel?.identifier;
		const mode = widget.input.currentModeObs.get();

		this._tipPool = this._buildTipPool(mode.kind, modelId);
		if (this._tipPool.length === 0) {
			return;
		}

		// Show first tip immediately
		this._showCurrentTip();

		// Rotate every 30 seconds
		this._timer.cancelAndSet(() => {
			this._tipIndex = (this._tipIndex + 1) % this._tipPool.length;
			this._showCurrentTip();
		}, TIP_ROTATION_INTERVAL_MS);
	}

	stopTips(): void {
		this._timer.cancel();
		this._widgetDisposable.clear();
		if (this._widget) {
			this._widget.resetInputPlaceholder();
			this._widget = undefined;
		}
		this._tipPool = [];
		this._tipIndex = 0;
	}

	private _buildTipPool(modeKind: ChatModeKind, modelIdentifier: string | undefined): string[] {
		const modeTips = [...getTipsForMode(modeKind)];
		const modelTip = getModelUpgradeTip(modelIdentifier);

		if (!modelTip) {
			return modeTips;
		}

		// Mix mode tips and model upgrade tip equally
		// Interleave the model tip among mode tips
		const result: string[] = [];
		for (let i = 0; i < modeTips.length; i++) {
			result.push(modeTips[i]);
			// Add model tip after each mode tip to ensure equal distribution
			result.push(modelTip);
		}
		// If there are no mode tips, just show the model tip
		if (result.length === 0) {
			result.push(modelTip);
		}
		return result;
	}

	private _showCurrentTip(): void {
		if (this._widget && this._tipPool.length > 0) {
			this._widget.setInputPlaceholder(this._tipPool[this._tipIndex]);
		}
	}
}
