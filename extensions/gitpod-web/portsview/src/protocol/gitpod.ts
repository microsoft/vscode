/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type IconStatus = 'Served' | 'NotServed' | 'Detecting' | 'ExposureFailed';

export interface PortInfo {
	label: string;
	tooltip: string;
	description: string;
	iconStatus: IconStatus;
	contextValue: string;
	localUrl: string;
	// iconPath?: vscode.ThemeIcon;
}

export enum TunnelVisiblity {
	NONE = 0,
	HOST = 1,
	NETWORK = 2,
}

export enum PortVisibility {
	PRIVATE = 0,
	PUBLIC = 1,
}

export enum OnPortExposedAction {
	IGNORE = 0,
	OPEN_BROWSER = 1,
	OPEN_PREVIEW = 2,
	NOTIFY = 3,
	NOTIFY_PRIVATE = 4,
}

export enum PortAutoExposure {
	TRYING = 0,
	SUCCEEDED = 1,
	FAILED = 2,
}

export enum TaskState {
	OPENING = 0,
	RUNNING = 1,
	CLOSED = 2,
}


export namespace ExposedPortInfo {
	export type AsObject = {
		visibility: PortVisibility;
		url: string;
		onExposed: OnPortExposedAction;
	};
}

export namespace TunneledPortInfo {
	export type AsObject = {
		targetPort: number;
		visibility: TunnelVisiblity;

		clientsMap: Array<[string, number]>;
	};
}

export namespace PortsStatus {
	export type AsObject = {
		localPort: number;
		served: boolean;
		exposed?: ExposedPortInfo.AsObject;
		autoExposure: PortAutoExposure;
		tunneled?: TunneledPortInfo.AsObject;
		description: string;
		name: string;
	};
}


export interface GitpodPortObject {
	info: PortInfo;
	status: PortsStatus.AsObject & { remotePort?: number };
}

export const PortCommands = <const>['tunnelNetwork', 'tunnelHost', 'makePublic', 'makePrivate', 'preview', 'openBrowser', 'retryAutoExpose', 'urlCopy', 'queryPortData'];

export type PortCommand = typeof PortCommands[number];
