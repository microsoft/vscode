/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';

/**
 * Knows where local agent host sessions work, such as the sessions of a session layer that the Chat view's sessions list
 * does not list. It only nominates working directories: whether one is a location of the window's folder, and inherits
 * its trust, is decided by `AgentHostWorktreeLocationProvider` alone.
 */
export interface IAgentHostWorktreeSessionSource {
	/** Where the chat of `chatResource` works, if this source knows it. */
	getWorkingDirectory(chatResource: URI): URI | undefined;
	/** Where the non-archived local agent host sessions it knows work. */
	getWorkingDirectories(): readonly URI[];
	/** Resolves once it knows its sessions, such as after their first load. */
	whenReady?(token: CancellationToken): Promise<void>;
	/** Fires as its sessions, or where they work, change. */
	readonly onDidChange: Event<void>;
}

export const IAgentHostWorktreeSessionSources = createDecorator<IAgentHostWorktreeSessionSources>('agentHostWorktreeSessionSources');

/** The {@link IAgentHostWorktreeSessionSource sources} of where local agent host sessions work, besides the Chat view's sessions list. */
export interface IAgentHostWorktreeSessionSources {
	readonly _serviceBrand: undefined;

	/** Fires as a source is registered or unregistered, or as one changes. */
	readonly onDidChange: Event<void>;

	/** Counts `source` among the sources until the returned disposable is disposed. */
	registerSource(source: IAgentHostWorktreeSessionSource): IDisposable;

	/** Where the chat of `chatResource` works, as the first source that knows it has it. */
	getWorkingDirectory(chatResource: URI): URI | undefined;

	/** Where the sessions of all sources work. */
	getWorkingDirectories(): readonly URI[];

	/** Resolves once every source knows its sessions. */
	whenReady(token: CancellationToken): Promise<void>;
}

export class AgentHostWorktreeSessionSources extends Disposable implements IAgentHostWorktreeSessionSources {

	declare readonly _serviceBrand: undefined;

	private readonly _sources = new Set<{ readonly source: IAgentHostWorktreeSessionSource; readonly listener: IDisposable }>();

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	registerSource(source: IAgentHostWorktreeSessionSource): IDisposable {
		const registration = { source, listener: source.onDidChange(() => this._onDidChange.fire()) };
		this._sources.add(registration);
		this._onDidChange.fire();
		return toDisposable(() => {
			if (this._sources.delete(registration)) {
				registration.listener.dispose();
				this._onDidChange.fire();
			}
		});
	}

	getWorkingDirectory(chatResource: URI): URI | undefined {
		for (const { source } of this._sources) {
			const workingDirectory = source.getWorkingDirectory(chatResource);
			if (workingDirectory) {
				return workingDirectory;
			}
		}
		return undefined;
	}

	getWorkingDirectories(): readonly URI[] {
		return [...this._sources].flatMap(({ source }) => source.getWorkingDirectories());
	}

	async whenReady(token: CancellationToken): Promise<void> {
		await Promise.all([...this._sources].map(({ source }) => source.whenReady?.(token)));
	}

	override dispose(): void {
		for (const { listener } of this._sources) {
			listener.dispose();
		}
		this._sources.clear();
		super.dispose();
	}
}

registerSingleton(IAgentHostWorktreeSessionSources, AgentHostWorktreeSessionSources, InstantiationType.Delayed);
