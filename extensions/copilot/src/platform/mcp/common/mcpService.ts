/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Event, McpGateway, McpServerDefinition } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { Emitter } from '../../../util/vs/base/common/event';
import { DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { URI } from '../../../util/vs/base/common/uri';

export const IMcpService = createServiceIdentifier<IMcpService>('IMcpService');

export interface IMcpService {
	readonly _serviceBrand: undefined;
	readonly mcpServerDefinitions: readonly McpServerDefinition[];
	readonly onDidChangeMcpServerDefinitions: Event<void>;
	startMcpGateway(resource: URI): Promise<McpGateway | undefined>;
}

export abstract class AbstractMcpService implements IMcpService {
	declare readonly _serviceBrand: undefined;
	abstract readonly mcpServerDefinitions: readonly McpServerDefinition[];
	abstract readonly onDidChangeMcpServerDefinitions: Event<void>;
	abstract startMcpGateway(resource: URI): Promise<McpGateway | undefined>;
}

export class NullMcpService extends AbstractMcpService implements IDisposable {
	private readonly disposables = new DisposableStore();

	readonly mcpServerDefinitions: McpServerDefinition[] = [];
	readonly onDidChangeMcpServerDefinitions: Event<void> = this.disposables.add(new Emitter<void>()).event;
	async startMcpGateway(_resource: URI): Promise<McpGateway | undefined> {
		return undefined;
	}
	public dispose() {
		this.disposables.dispose();
	}
}
