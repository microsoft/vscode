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

export const IChatTipService = createDecorator<IChatTipService>('chatTipService');

export interface IChatTip {
	readonly id: string;
	readonly content: MarkdownString;
}

export interface IChatTipService {
	readonly _serviceBrand: undefined;

	/**
	 * Gets the next tip to show for a request, or undefined if no tips are available.
	 * Tips are not repeated within the same window session.
	 * @param requestId The unique ID of the request (used for stable rerenders).
	 */
	getNextTip(requestId: string): IChatTip | undefined;
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
		id: 'tip.askMode',
		message: localize('tip.askMode', "Tip: Switch to [Ask mode](command:workbench.action.chat.openAskSession) for questions without making changes."),
		when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
		enabledCommands: ['workbench.action.chat.openAskSession'],
	},
	{
		id: 'tip.attachFiles',
		message: localize('tip.attachFiles', "Tip: Attach files or folders with # to give Copilot more context."),
	},
	{
		id: 'tip.inlineChat',
		message: localize('tip.inlineChat', "Tip: Press {0} in the editor for quick inline edits.", '`Ctrl+I`'),
	},
	{
		id: 'tip.codeActions',
		message: localize('tip.codeActions', "Tip: Select code and right-click for Copilot actions in the context menu."),
	},
	{
		id: 'tip.undoChanges',
		message: localize('tip.undoChanges', "Tip: You can undo Copilot's changes with {0}.", '`Ctrl+Z`'),
		when: ContextKeyExpr.or(
			ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
			ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit),
		),
	},
];

export class ChatTipService implements IChatTipService {
	readonly _serviceBrand: undefined;

	/**
	 * Set of tip IDs that have been shown in this window session.
	 */
	private readonly _shownTipIds = new Set<string>();

	/**
	 * Map from request ID to the tip ID assigned to that request.
	 * Used to ensure stable rerenders show the same tip.
	 */
	private readonly _requestToTipId = new Map<string, string>();

	/**
	 * Index for round-robin tip selection among eligible tips.
	 */
	private _nextIndex = 0;

	constructor(
		@IProductService private readonly _productService: IProductService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) { }

	getNextTip(requestId: string): IChatTip | undefined {
		// Only show tips for Copilot
		if (!this._isCopilotEnabled()) {
			return undefined;
		}

		// Check if we already assigned a tip to this request (for stable rerenders)
		const existingTipId = this._requestToTipId.get(requestId);
		if (existingTipId) {
			const tipDef = TIP_CATALOG.find(t => t.id === existingTipId);
			if (tipDef) {
				return this._createTip(tipDef);
			}
		}

		// Find eligible tips that haven't been shown yet
		const eligibleTips = TIP_CATALOG.filter(
			tip => this._isEligible(tip) && !this._shownTipIds.has(tip.id)
		);

		if (eligibleTips.length === 0) {
			// All tips exhausted, stop showing tips
			return undefined;
		}

		// Pick the next tip (round-robin among eligible)
		const tipIndex = this._nextIndex % eligibleTips.length;
		const selectedTip = eligibleTips[tipIndex];
		this._nextIndex++;

		// Record that this tip has been shown
		this._shownTipIds.add(selectedTip.id);
		this._requestToTipId.set(requestId, selectedTip.id);

		return this._createTip(selectedTip);
	}

	private _isEligible(tip: ITipDefinition): boolean {
		if (!tip.when) {
			return true;
		}
		return this._contextKeyService.contextMatchesRules(tip.when);
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
