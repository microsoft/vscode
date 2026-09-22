/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { CopilotConnectorConnectionStatus, ICopilotConnector } from './copilotConnectorsService.js';

export type ConnectorPrimaryAction = 'connect' | 'disconnect' | 'reconnect' | 'refresh';
export type ConnectorRowAction = 'connect' | 'sign_in' | 'reconnect' | 'review' | 'retry' | 'more';
export type ConnectorRowStatusIcon = 'connected' | 'attention' | 'pending' | 'error' | 'info';

export interface IConnectorRowPresentation {
	readonly statusLabel: string;
	readonly statusIcon?: ConnectorRowStatusIcon;
	readonly action?: ConnectorRowAction;
	readonly actionLabel?: string;
}

export function getConnectorPrimaryAction(connectionStatus: CopilotConnectorConnectionStatus): ConnectorPrimaryAction {
	switch (connectionStatus) {
		case 'connected':
			return 'disconnect';
		case 'pending':
			return 'refresh';
		case 'error':
			return 'reconnect';
		case 'not_connected':
			return 'connect';
	}
}

export function getConnectorStatusLabel(connectionStatus: CopilotConnectorConnectionStatus): string {
	switch (connectionStatus) {
		case 'connected':
			return localize('connectors.status.connected', "Connected");
		case 'pending':
			return localize('connectors.status.pending', "Connection pending");
		case 'error':
			return localize('connectors.status.error', "Needs attention");
		case 'not_connected':
			return localize('connectors.status.notConnected', "Not connected");
	}
}

export function getConnectorActionLabel(action: ConnectorPrimaryAction): string {
	switch (action) {
		case 'connect':
			return localize('connectors.action.connect', "Connect");
		case 'refresh':
			return localize('connectors.action.refresh', "Refresh");
		case 'disconnect':
			return localize('connectors.action.disconnect', "Disconnect");
		case 'reconnect':
			return localize('connectors.action.reconnect', "Reconnect");
	}
}

export function getConnectorRowPresentation(connector: ICopilotConnector): IConnectorRowPresentation {
	switch (connector.connectionStatusDetail) {
		case 'sign_in_required':
			return {
				statusLabel: localize('connectors.status.signInRequired', "Sign in required"),
				statusIcon: 'attention',
				action: 'sign_in',
				actionLabel: localize('connectors.action.signIn', "Sign in"),
			};
		case 'reconnect_required':
			return {
				statusLabel: localize('connectors.status.reconnectRequired', "Reconnect required"),
				statusIcon: 'attention',
				action: 'reconnect',
				actionLabel: localize('connectors.action.reconnect', "Reconnect"),
			};
		case 'review_required':
			return {
				statusLabel: localize('connectors.status.reviewRequired', "Review required"),
				statusIcon: 'attention',
				action: 'review',
				actionLabel: localize('connectors.action.review', "Review"),
			};
		case 'retryable_error':
			return {
				statusLabel: localize('connectors.status.retryableError', "Connection failed"),
				statusIcon: 'error',
				action: 'retry',
				actionLabel: localize('connectors.action.tryAgain', "Try Again"),
			};
		case 'unavailable':
			return {
				statusLabel: localize('connectors.status.unavailable', "Currently unavailable"),
				statusIcon: 'info',
			};
	}

	switch (connector.connectionStatus) {
		case 'connected':
			return {
				statusLabel: getConnectorStatusLabel(connector.connectionStatus),
				statusIcon: 'connected',
				action: 'more',
			};
		case 'pending':
			return {
				statusLabel: getConnectorStatusLabel(connector.connectionStatus),
				statusIcon: 'pending',
			};
		case 'error':
			return {
				statusLabel: getConnectorStatusLabel(connector.connectionStatus),
				statusIcon: 'error',
				action: 'reconnect',
				actionLabel: getConnectorActionLabel('reconnect'),
			};
		case 'not_connected':
			return {
				statusLabel: getConnectorStatusLabel(connector.connectionStatus),
				action: 'connect',
				actionLabel: getConnectorActionLabel('connect'),
			};
	}
}
