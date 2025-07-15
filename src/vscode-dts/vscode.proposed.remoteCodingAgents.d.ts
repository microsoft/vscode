/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface RemoteCodingAgentInformation {
		id: number;
		number: number;
		title: string;
		user: {
			login: string;
		};
		html_url: string;
		state: string;
		created_at: string;
		updated_at: string;
	}

	export interface RemoteCodingAgentInformationProvider extends Disposable {
		onDidChangeCodingAgentInformation: Event<RemoteCodingAgentInformation>;
		onDidSelectItem: (codingAgentId: string) => void;
		provideCodingAgentsInformation(token: CancellationToken): AsyncIterable<RemoteCodingAgentInformation>;
	}

	export namespace remoteCodingAgents {
		export function registerCodingAgentInformationProvider(provider: RemoteCodingAgentInformationProvider): Disposable;
	}
}
