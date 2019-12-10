/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostTunnelServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import * as vscode from 'vscode';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IExtHostTunnelService extends ExtHostTunnelServiceShape {
	makeTunnel(forward: vscode.TunnelOptions): Promise<vscode.Tunnel>;
}

export const IExtHostTunnelService = createDecorator<IExtHostTunnelService>('IExtHostTunnelService');

export class ExtHostTunnelService implements IExtHostTunnelService {
	makeTunnel(forward: vscode.TunnelOptions): Promise<vscode.Tunnel> {
		throw new Error('Method not implemented.');
	}
}

