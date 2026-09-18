/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IAgentHostCustomizationService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { getEffectiveMcpServerCount } from '../../../../workbench/contrib/chat/browser/aiCustomization/mcpServerCount.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';

export const IAICustomizationMcpServerCountService = createDecorator<IAICustomizationMcpServerCountService>('aiCustomizationMcpServerCountService');

export interface IAICustomizationMcpServerCountService {
	readonly _serviceBrand: undefined;
	readonly count: IObservable<number>;
}

export class AICustomizationMcpServerCountService extends Disposable implements IAICustomizationMcpServerCountService {
	declare readonly _serviceBrand: undefined;

	private readonly agentHostCustomizationsChanged: IObservable<void>;
	readonly count: IObservable<number>;

	constructor(
		@IMcpService private readonly mcpService: IMcpService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
	) {
		super();
		this.agentHostCustomizationsChanged = observableSignalFromEvent(this, this.agentHostCustomizationService.onDidChangeCustomizations);
		this.count = derived(this, reader => {
			this.agentHostCustomizationsChanged.read(reader);
			this.customizationHarnessService.activeHarness.read(reader);
			this.customizationHarnessService.availableHarnesses.read(reader);
			const sessionResource = this.customizationHarnessService.activeSessionResource.read(reader);
			return getEffectiveMcpServerCount(
				this.mcpService.servers.read(reader),
				this.agentHostCustomizationService.getMcpServers(sessionResource),
				reader,
				this.customizationHarnessService.getActiveDescriptor().hiddenMcpServerCollectionIds,
			);
		});
	}
}

registerSingleton(IAICustomizationMcpServerCountService, AICustomizationMcpServerCountService, InstantiationType.Delayed);
