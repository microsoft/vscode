/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { IFileService } from '../../files/common/files.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILabelService } from '../../label/common/label.js';
import { AgentHostFileSystemProvider, type IRemoteFilesystemConnection } from './agentHostFileSystemProvider.js';
import { AGENT_HOST_LABEL_FORMATTER, AGENT_HOST_SCHEME } from './agentHostUri.js';

export type { IRemoteFilesystemConnection } from './agentHostFileSystemProvider.js';

export const IAgentHostFileSystemService = createDecorator<IAgentHostFileSystemService>('agentHostFileSystemService');

export interface IAgentHostFileSystemService {
	readonly _serviceBrand: undefined;

	/**
	 * Register a mapping from a URI authority to a connection so that
	 * `vscode-agent-host://[authority]/…` URIs resolve through this connection.
	 */
	registerAuthority(authority: string, connection: IRemoteFilesystemConnection): IDisposable;
}

class AgentHostFileSystemService extends Disposable implements IAgentHostFileSystemService {
	declare readonly _serviceBrand: undefined;

	private readonly _fsProvider: AgentHostFileSystemProvider;

	constructor(
		@IFileService fileService: IFileService,
		@ILabelService labelService: ILabelService,
	) {
		super();

		this._fsProvider = this._register(new AgentHostFileSystemProvider());
		this._register(fileService.registerProvider(AGENT_HOST_SCHEME, this._fsProvider));
		this._register(labelService.registerFormatter(AGENT_HOST_LABEL_FORMATTER));
	}

	registerAuthority(authority: string, connection: IRemoteFilesystemConnection): IDisposable {
		return this._fsProvider.registerAuthority(authority, connection);
	}
}

registerSingleton(IAgentHostFileSystemService, AgentHostFileSystemService, InstantiationType.Delayed);
