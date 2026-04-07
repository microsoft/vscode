/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEndpointProvider } from '../../../../../platform/endpoint/common/endpointProvider';
import { IVSCodeExtensionContext } from '../../../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../../../platform/log/common/logService';
import { ClaudeCodeModelInfo, ClaudeCodeModels } from '../claudeCodeModels';

export class MockClaudeCodeModels extends ClaudeCodeModels {
	constructor(
		@IEndpointProvider endpointProvider: IEndpointProvider,
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext,
		@ILogService logService: ILogService,
	) {
		super(endpointProvider, extensionContext, logService);
	}

	override async getModels(): Promise<ClaudeCodeModelInfo[]> {
		return [
			{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
			{ id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
			{ id: 'claude-haiku-3-5-20250514', name: 'Claude Haiku 3.5' },
		];
	}
}
