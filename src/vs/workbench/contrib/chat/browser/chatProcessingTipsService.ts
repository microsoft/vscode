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
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IMcpService } from '../../mcp/common/mcpTypes.js';
import { URI } from '../../../../base/common/uri.js';

export const IChatProcessingTipsService = createDecorator<IChatProcessingTipsService>('chatProcessingTipsService');

export interface IChatProcessingTipsService {
	readonly _serviceBrand: undefined;

	/**
	 * Start showing rotating tips in the chat input placeholder.
	 * Tips rotate every 30 seconds and include mode-specific tips and customization recommendations.
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

// Tip prefix icon (lightbulb emoji)
// allow-any-unicode-next-line
const TIP_PREFIX = '💡 ';

// Tips for ASK and EDIT modes (promoting Agent mode)
const ASK_EDIT_TIPS = [
	localize('tip.askEdit.tryAgent', "{0}Try agent mode for autonomous coding.", TIP_PREFIX),
];

// Tips for AGENT mode
const AGENT_TIPS = [
	localize('tip.agent.background', "{0}Use background agents for parallel tasks.", TIP_PREFIX),
	localize('tip.agent.cloud', "{0}Delegate tasks to the cloud with @cloud.", TIP_PREFIX),
	localize('tip.agent.multiple', "{0}Run multiple agents with the + button.", TIP_PREFIX),
	localize('tip.agent.checkpoint', "{0}Restore to a previous checkpoint anytime.", TIP_PREFIX),
	localize('tip.agent.copy', "{0}Right-click messages to copy output.", TIP_PREFIX),
];

// Customization tips (shown conditionally based on workspace configuration)
const CUSTOMIZATION_TIPS = {
	noInstructions: localize('tip.custom.instructions', "{0}Add workspace instructions to customize Copilot.", TIP_PREFIX),
	noPrompts: localize('tip.custom.prompts', "{0}Create prompt files for reusable /commands.", TIP_PREFIX),
	noAgents: localize('tip.custom.agents', "{0}Define custom agent personas.", TIP_PREFIX),
	noMcp: localize('tip.custom.mcp', "{0}Add MCP servers for more tools.", TIP_PREFIX),
};

/**
 * Gets mode-specific tips based on the current chat mode.
 */
function getTipsForMode(modeKind: ChatModeKind): readonly string[] {
	switch (modeKind) {
		case ChatModeKind.Agent:
			return AGENT_TIPS;
		case ChatModeKind.Edit:
		case ChatModeKind.Ask:
			return ASK_EDIT_TIPS;
		default:
			return [];
	}
}

export class ChatProcessingTipsService extends Disposable implements IChatProcessingTipsService {
	declare readonly _serviceBrand: undefined;

	private readonly _timer = this._register(new IntervalTimer());
	private readonly _widgetDisposable = this._register(new MutableDisposable<IDisposable>());
	private _tipIndex = 0;
	private _tipPool: string[] = [];
	private _widget: IChatWidget | undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IMcpService private readonly _mcpService: IMcpService,
	) {
		super();
	}

	startTips(widget: IChatWidget): void {
		// Clear any existing tips
		this.stopTips();

		this._widget = widget;
		const mode = widget.input.currentModeObs.get();

		// Build tip pool asynchronously (checks file conditions)
		this._buildTipPoolAsync(mode.kind).then(tips => {
			if (this._widget !== widget) {
				// Widget changed while building tips
				return;
			}

			this._tipPool = tips;
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
		});
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

	private async _buildTipPoolAsync(modeKind: ChatModeKind): Promise<string[]> {
		const tips: string[] = [];

		// Add mode-specific tips
		tips.push(...getTipsForMode(modeKind));

		// Add customization tips based on workspace configuration
		const customizationTips = await this._getCustomizationTips();
		tips.push(...customizationTips);

		// Shuffle the tips for variety
		return this._shuffleArray(tips);
	}

	private async _getCustomizationTips(): Promise<string[]> {
		const tips: string[] = [];

		const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			return tips;
		}

		// Check the first workspace folder for customization files
		const workspaceRoot = workspaceFolders[0].uri;

		// Check for .github/copilot-instructions.md
		const instructionsPath = URI.joinPath(workspaceRoot, '.github', 'copilot-instructions.md');
		const hasInstructions = await this._fileService.exists(instructionsPath);
		if (!hasInstructions) {
			tips.push(CUSTOMIZATION_TIPS.noInstructions);
		}

		// Check for .github/prompts folder (non-empty)
		const promptsPath = URI.joinPath(workspaceRoot, '.github', 'prompts');
		const hasPrompts = await this._folderHasContent(promptsPath);
		if (!hasPrompts) {
			tips.push(CUSTOMIZATION_TIPS.noPrompts);
		}

		// Check for .github/agents folder (non-empty)
		const agentsPath = URI.joinPath(workspaceRoot, '.github', 'agents');
		const hasAgents = await this._folderHasContent(agentsPath);
		if (!hasAgents) {
			tips.push(CUSTOMIZATION_TIPS.noAgents);
		}

		// Check for MCP servers
		const servers = this._mcpService.servers.get();
		if (servers.length === 0) {
			tips.push(CUSTOMIZATION_TIPS.noMcp);
		}

		return tips;
	}

	private async _folderHasContent(folderUri: URI): Promise<boolean> {
		try {
			const exists = await this._fileService.exists(folderUri);
			if (!exists) {
				return false;
			}
			const stat = await this._fileService.resolve(folderUri);
			return (stat.children?.length ?? 0) > 0;
		} catch {
			return false;
		}
	}

	private _shuffleArray<T>(array: T[]): T[] {
		const result = [...array];
		for (let i = result.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[result[i], result[j]] = [result[j], result[i]];
		}
		return result;
	}

	private _showCurrentTip(): void {
		if (this._widget && this._tipPool.length > 0) {
			this._widget.setInputPlaceholder(this._tipPool[this._tipIndex]);
		}
	}
}
