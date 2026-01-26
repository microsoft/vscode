/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatModeKind } from '../common/constants.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

export const IChatTipService = createDecorator<IChatTipService>('chatTipService');

export interface IChatTip {
	readonly id: string;
	readonly content: MarkdownString;
}

export interface IChatTipService {
	readonly _serviceBrand: undefined;

	/**
	 * Gets a tip to show for a request, or undefined if a tip has already been shown this session.
	 * Only one tip is shown per VS Code session (resets on reload).
	 * Tips are only shown for requests created after the service was instantiated.
	 * @param requestId The unique ID of the request (used for stable rerenders).
	 * @param requestTimestamp The timestamp when the request was created.
	 * @param contextKeyService The context key service to evaluate tip eligibility.
	 */
	getNextTip(requestId: string, requestTimestamp: number, contextKeyService: IContextKeyService): IChatTip | undefined;
}

interface ITipDefinition {
	readonly id: string;
	readonly message: string;
	/**
	 * When clause expression that determines if this tip is eligible to be shown.
	 * If undefined, the tip is always eligible.
	 */
	readonly when?: ContextKeyExpression;
	/**
	 * Command IDs that are allowed to be executed from this tip's markdown.
	 */
	readonly enabledCommands?: string[];
}

/**
 * Static catalog of tips. Each tip has an optional when clause for eligibility.
 */
const TIP_CATALOG: ITipDefinition[] = [
	{
		id: 'tip.agentMode',
		message: localize('tip.agentMode', "Tip: Try [Agent mode](command:workbench.action.chat.openEditSession) for multi-file edits and running commands."),
		when: ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Agent),
		enabledCommands: ['workbench.action.chat.openEditSession'],
	},
	{
		id: 'tip.planMode',
		message: localize('tip.planMode', "Tip: Try [Plan mode](command:workbench.action.chat.openPlan) to let the agent perform deep analysis and planning before implementing changes."),
		when: ChatContextKeys.chatModeName.notEqualsTo('Plan'),
		enabledCommands: ['workbench.action.chat.openPlan'],
	},
	{
		id: 'tip.attachFiles',
		message: localize('tip.attachFiles', "Tip: Attach files or folders with # to give Copilot more context."),
	},
	{
		id: 'tip.codeActions',
		message: localize('tip.codeActions', "Tip: Select code and right-click for Copilot actions in the context menu."),
	},
	{
		id: 'tip.undoChanges',
		message: localize('tip.undoChanges', "Tip: You can undo Copilot's changes to any point by clicking Restore Checkpoint."),
		when: ContextKeyExpr.or(
			ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
			ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit),
		),
	},
	{
		id: 'tip.customInstructions',
		message: localize('tip.customInstructions', "Tip: [Generate workspace instructions](command:workbench.action.chat.generateInstructions) so Copilot always has the context it needs when starting a task."),
		enabledCommands: ['workbench.action.chat.generateInstructions'],
	}
];

export class ChatTipService implements IChatTipService {
	readonly _serviceBrand: undefined;

	/**
	 * Timestamp when this service was instantiated.
	 * Used to only show tips for requests created after this time.
	 */
	private readonly _createdAt = Date.now();

	/**
	 * Whether a tip has already been shown in this window session.
	 * Only one tip is shown per session.
	 */
	private _hasShownTip = false;

	/**
	 * The request ID that was assigned a tip (for stable rerenders).
	 */
	private _tipRequestId: string | undefined;

	/**
	 * The tip that was shown (for stable rerenders).
	 */
	private _shownTip: ITipDefinition | undefined;

	constructor(
		@IProductService private readonly _productService: IProductService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) { }

	getNextTip(requestId: string, requestTimestamp: number, contextKeyService: IContextKeyService): IChatTip | undefined {
		// Check if tips are enabled
		if (!this._configurationService.getValue<boolean>('chat.tips.enabled')) {
			return undefined;
		}

		// Only show tips for Copilot
		if (!this._isCopilotEnabled()) {
			return undefined;
		}

		// Check if this is the request that was assigned a tip (for stable rerenders)
		if (this._tipRequestId === requestId && this._shownTip) {
			return this._createTip(this._shownTip);
		}

		// Only show one tip per session
		if (this._hasShownTip) {
			return undefined;
		}

		// Only show tips for requests created after the service was instantiated
		// This prevents showing tips for old requests being re-rendered after reload
		if (requestTimestamp < this._createdAt) {
			return undefined;
		}

		// Find eligible tips
		const eligibleTips = TIP_CATALOG.filter(tip => this._isEligible(tip, contextKeyService));

		if (eligibleTips.length === 0) {
			return undefined;
		}

		// Pick a random tip from eligible tips
		const randomIndex = Math.floor(Math.random() * eligibleTips.length);
		const selectedTip = eligibleTips[randomIndex];

		// Record that we've shown a tip this session
		this._hasShownTip = true;
		this._tipRequestId = requestId;
		this._shownTip = selectedTip;

		return this._createTip(selectedTip);
	}

	private _isEligible(tip: ITipDefinition, contextKeyService: IContextKeyService): boolean {
		if (!tip.when) {
			return true;
		}
		return contextKeyService.contextMatchesRules(tip.when);
	}

	private _isCopilotEnabled(): boolean {
		const defaultChatAgent = this._productService.defaultChatAgent;
		return !!defaultChatAgent?.chatExtensionId;
	}

	private _createTip(tipDef: ITipDefinition): IChatTip {
		const markdown = new MarkdownString(tipDef.message, {
			isTrusted: tipDef.enabledCommands ? { enabledCommands: tipDef.enabledCommands } : false,
		});
		return {
			id: tipDef.id,
			content: markdown,
		};
	}
}
