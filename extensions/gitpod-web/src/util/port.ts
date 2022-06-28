/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as workspaceInstance from '@gitpod/gitpod-protocol/lib/workspace-instance';
import { GitpodExtensionContext } from 'gitpod-shared';
import { PortsStatus, PortAutoExposure, PortVisibility } from '@gitpod/supervisor-api-grpc/lib/status_pb';
import { TunnelVisiblity, TunnelPortRequest } from '@gitpod/supervisor-api-grpc/lib/port_pb';
import { URL } from 'url';
import * as util from 'util';

export interface TunnelDescriptionI {
	remoteAddress: { port: number; host: string };
	//The complete local address(ex. localhost:1234)
	localAddress: { port: number; host: string } | string;
	/**
	 * @deprecated Use privacy instead
	 */
	public?: boolean;
	privacy?: string;
	// If protocol is not provided it is assumed to be http, regardless of the localAddress.
	protocol?: string;
}

export type IconStatus = 'Served' | 'NotServed' | 'Detecting' | 'ExposureFailed';

export const iconStatusMap: Record<IconStatus, { icon: string; color?: string }> = {
	Served: {
		icon: 'circle-filled',
		color: 'ports.iconRunningProcessForeground',
	},
	NotServed: {
		icon: 'circle-outline',
	},
	Detecting: {
		icon: 'circle-filled',
		color: 'editorWarning.foreground',
	},
	ExposureFailed: {
		icon: 'warning',
		color: 'editorWarning.foreground',
	},
};

export interface PortInfo {
	label: string;
	tooltip: string;
	description: string;
	iconStatus: IconStatus;
	contextValue: string;
	localUrl: string;
}

export class GitpodWorkspacePort {
	public info: PortInfo;
	public status: PortsStatus.AsObject;
	public localUrl: string;
	constructor(
		readonly portNumber: number,
		private readonly context: GitpodExtensionContext,
		private portStatus: PortsStatus,
		private tunnel?: TunnelDescriptionI,
	) {
		this.status = portStatus.toObject();
		this.portStatus = portStatus;
		this.tunnel = tunnel;
		this.info = this.parsePortInfo(portStatus, tunnel);
		this.localUrl = 'http://localhost:' + portStatus.getLocalPort();
	}

	update(portStatus: PortsStatus, tunnel?: TunnelDescriptionI) {
		this.status = portStatus.toObject();
		this.portStatus = portStatus;
		this.tunnel = tunnel;
		this.info = this.parsePortInfo(portStatus, tunnel);
	}

	private parsePortInfo(portStatus: PortsStatus, tunnel?: TunnelDescriptionI) {
		const currentStatus = portStatus.toObject();
		const { name, localPort, description, exposed, served } = currentStatus;
		// const prevStatus = port.status;
		const port: PortInfo = {
			label: '',
			tooltip: '',
			description: '',
			contextValue: '',
			iconStatus: 'NotServed',
			localUrl: 'http://localhost:' + localPort,
		};
		port.label = name ? `${name}: ${localPort}` : `${localPort}`;
		if (description) {
			port.tooltip = name ? `${name} - ${description}` : description;
		}

		if (this.remotePort && this.remotePort !== localPort) {
			port.label += ':' + this.remotePort;
		}

		const accessible = exposed || tunnel;

		// We use .public here because https://github.com/gitpod-io/openvscode-server/pull/360#discussion_r882953586
		const isPortTunnelPublic = !!tunnel?.public;
		if (!served) {
			port.description = 'not served';
			port.iconStatus = 'NotServed';
		} else if (!accessible) {
			if (portStatus.getAutoExposure() === PortAutoExposure.FAILED) {
				port.description = 'failed to expose';
				port.iconStatus = 'ExposureFailed';
			} else {
				port.description = 'detecting...';
				port.iconStatus = 'Detecting';
			}
		} else {
			port.description = 'open';
			if (tunnel) {
				port.description += ` on ${isPortTunnelPublic ? 'all interfaces' : 'localhost'}`;
			}
			if (exposed) {
				port.description += ` ${exposed.visibility === PortVisibility.PUBLIC ? '(public)' : '(private)'}`;
			}
			port.iconStatus = 'Served';
		}

		port.contextValue = 'port';
		if (served) {
			port.contextValue = 'served-' + port.contextValue;
		}
		if (exposed) {
			port.contextValue = 'exposed-' + port.contextValue;
			port.contextValue = (exposed.visibility === PortVisibility.PUBLIC ? 'public-' : 'private-') + port.contextValue;
		}
		if (tunnel) {
			port.contextValue = 'tunneled-' + port.contextValue;
			port.contextValue = (isPortTunnelPublic ? 'network-' : 'host-') + port.contextValue;
		}
		if (!accessible && portStatus.getAutoExposure() === PortAutoExposure.FAILED) {
			port.contextValue = 'failed-' + port.contextValue;
		}
		return port;
	}

	toSvelteObject() {
		return {
			info: this.info,
			status: {
				...this.status,
				remotePort: this.remotePort,
			},
		};
	}

	get externalUrl(): string {
		if (this.tunnel) {
			const localAddress = typeof this.tunnel.localAddress === 'string' ? this.tunnel.localAddress : this.tunnel.localAddress.host + ':' + this.tunnel.localAddress.port;
			return localAddress.startsWith('http') ? localAddress : `http://${localAddress}`;
		}
		return this.status?.exposed?.url || this.localUrl;
	}
	get remotePort(): number | undefined {
		if (this.tunnel) {
			if (typeof this.tunnel.localAddress === 'string') {
				try {
					return Number(new URL(this.tunnel.localAddress).port);
				} catch {
					return undefined;
				}
			}
			return this.tunnel.localAddress.port;
		}
		return undefined;
	}
	async setPortVisibility(visibility: workspaceInstance.PortVisibility): Promise<void> {
		if (this.portStatus) {
			await this.context.gitpod.server.openPort(this.context.info.getWorkspaceId(), {
				port: this.portStatus.getLocalPort(),
				visibility
			});
		}
	}
	async setTunnelVisibility(visibility: TunnelVisiblity): Promise<void> {
		const request = new TunnelPortRequest();
		request.setPort(this.portNumber);
		request.setTargetPort(this.portNumber);
		request.setVisibility(visibility);
		await util.promisify(this.context.supervisor.port.tunnel.bind(this.context.supervisor.port, request, this.context.supervisor.metadata, {
			deadline: Date.now() + this.context.supervisor.deadlines.normal
		}))();
	}
}
