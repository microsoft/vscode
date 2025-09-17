/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService, IContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IPlanningModeService } from '../common/planningMode.js';
import { InPlanningModeContext, PlanningModeConversationCountContext, PlanningModeHasConversationContext } from '../common/planningModeContextKeys.js';

export class PlanningModeContextKeyController extends Disposable {

	private readonly inPlanningModeContext: IContextKey<boolean>;
	private readonly conversationCountContext: IContextKey<number>;
	private readonly hasConversationContext: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IPlanningModeService private readonly planningModeService: IPlanningModeService,
	) {
		super();

		// Create context keys
		this.inPlanningModeContext = InPlanningModeContext.bindTo(contextKeyService);
		this.conversationCountContext = PlanningModeConversationCountContext.bindTo(contextKeyService);
		this.hasConversationContext = PlanningModeHasConversationContext.bindTo(contextKeyService);

		// Initialize context keys
		this._updateContextKeys();

		// Listen for planning mode changes
		this._register(this.planningModeService.onDidChange(() => {
			this._updateContextKeys();
		}));

		// Listen for conversation changes
		this._register(this.planningModeService.onDidAddConversationEntry(() => {
			this._updateContextKeys();
		}));
	}

	private _updateContextKeys(): void {
		this.inPlanningModeContext.set(this.planningModeService.isActive);

		const conversationCount = this.planningModeService.conversationEntries.length;
		this.conversationCountContext.set(conversationCount);
		this.hasConversationContext.set(conversationCount > 0);
	}
}
