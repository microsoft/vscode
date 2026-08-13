/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LinkPresentation, LinkPresentationStatus } from '@vscode/markdown-editor';
import { derived, observableFromEvent, type IObservable } from '@vscode/observables';
import * as vscode from 'vscode';
import type { LinkPresentationResolver } from './linkPresentationResolver';

const agentSessionLinkPrefix = 'agent-host-session://';

export class AgentSessionLinkPresentationResolver implements LinkPresentationResolver {
	readonly refreshOnInterval = false;

	resolve(href: string): IObservable<LinkPresentation> | undefined {
		if (!href.startsWith(agentSessionLinkPrefix)) {
			return undefined;
		}

		return derived(reader => reader.store.add(new AgentSessionLinkData(vscode.Uri.parse(href))))
			.map((value, reader) => {
				const data = value.data.read(reader);
				return data ? getSessionLinkPresentation(data) : {
					kind: 'session',
					status: { kind: 'pending', label: 'Loading' },
				};
			});
	}

	dispose(): void { }
}

class AgentSessionLinkData implements vscode.Disposable {
	readonly #watcher: vscode.DataWatcher<vscode.AgentSessionData>;
	readonly data: IObservable<vscode.AgentSessionData | undefined>;

	constructor(resource: vscode.Uri) {
		this.#watcher = vscode.window.createDataWatcher({
			kind: vscode.DataWatcherKind.AgentSession,
			resource,
		});
		this.data = observableFromEvent(this, this.#watcher.onDidChange, () => this.#watcher.data);
	}

	dispose(): void {
		this.#watcher.dispose();
	}
}

function sessionStatus(status: vscode.AgentSessionData['status']): LinkPresentationStatus {
	switch (status) {
		case vscode.AgentSessionStatus.Untitled: return { kind: 'neutral', label: 'Not started' };
		case vscode.AgentSessionStatus.InProgress: return { kind: 'pending', label: 'Working' };
		case vscode.AgentSessionStatus.NeedsInput: return { kind: 'warning', label: 'Needs input' };
		case vscode.AgentSessionStatus.Completed: return { kind: 'success', label: 'Completed' };
		case vscode.AgentSessionStatus.Error: return { kind: 'error', label: 'Error' };
	}
}

export function getSessionLinkPresentation(value: vscode.AgentSessionData): LinkPresentation {
	const status = sessionStatus(value.status);
	return {
		kind: 'session',
		title: value.title,
		...(value.description ? { detail: value.description } : {}),
		status,
		tooltip: `${value.title} · ${status.label}`,
		ariaLabel: `Agent session ${value.title}, ${status.label}`,
	};
}
