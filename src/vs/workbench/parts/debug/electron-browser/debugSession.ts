/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { TPromise } from 'vs/base/common/winjs.base';
import { ISuggestion } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import { ITreeElement, ISession, IConfig, IRawSession, IThread, IRawModelUpdate, SessionState } from 'vs/workbench/parts/debug/common/debug';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { mixin } from 'vs/base/common/objects';
import { Thread, ExpressionContainer } from 'vs/workbench/parts/debug/common/debugModel';

export class Session implements ISession {

	private sources: Map<string, Source>;
	private threads: Map<number, Thread>;

	constructor(private _configuration: { resolved: IConfig, unresolved: IConfig }, private session: IRawSession & ITreeElement) {
		this.threads = new Map<number, Thread>();
		this.sources = new Map<string, Source>();
	}

	public get configuration(): IConfig {
		return this._configuration.resolved;
	}

	public get unresolvedConfiguration(): IConfig {
		return this._configuration.unresolved;
	}

	public get raw(): IRawSession & ITreeElement {
		return this.session;
	}

	public set raw(value: IRawSession & ITreeElement) {
		this.session = value;
	}

	public getName(includeRoot: boolean): string {
		return includeRoot && this.raw.root ? `${this.configuration.name} (${resources.basenameOrAuthority(this.raw.root.uri)})` : this.configuration.name;
	}

	public get state(): SessionState {
		return this.configuration.type === 'attach' ? SessionState.ATTACH : SessionState.LAUNCH;
	}

	public getSourceForUri(modelUri: uri): Source {
		return this.sources.get(modelUri.toString());
	}

	public getSource(raw: DebugProtocol.Source): Source {
		let source = new Source(raw, this.getId());
		if (this.sources.has(source.uri.toString())) {
			source = this.sources.get(source.uri.toString());
			source.raw = mixin(source.raw, raw);
			if (source.raw && raw) {
				// Always take the latest presentation hint from adapter #42139
				source.raw.presentationHint = raw.presentationHint;
			}
		} else {
			this.sources.set(source.uri.toString(), source);
		}

		return source;
	}

	public getThread(threadId: number): Thread {
		return this.threads.get(threadId);
	}

	public getAllThreads(): IThread[] {
		const result: IThread[] = [];
		this.threads.forEach(t => result.push(t));
		return result;
	}

	public getLoadedSources(): TPromise<Source[]> {
		return this.raw.loadedSources({}).then(response => {
			return response.body.sources.map(src => this.getSource(src));
		}, error => {
			return [];
		});
	}

	public getId(): string {
		return this.session.getId();
	}

	public rawUpdate(data: IRawModelUpdate): void {

		if (data.thread && !this.threads.has(data.threadId)) {
			// A new thread came in, initialize it.
			this.threads.set(data.threadId, new Thread(this, data.thread.name, data.thread.id));
		} else if (data.thread && data.thread.name) {
			// Just the thread name got updated #18244
			this.threads.get(data.threadId).name = data.thread.name;
		}

		if (data.stoppedDetails) {
			// Set the availability of the threads' callstacks depending on
			// whether the thread is stopped or not
			if (data.stoppedDetails.allThreadsStopped) {
				this.threads.forEach(thread => {
					thread.stoppedDetails = thread.threadId === data.threadId ? data.stoppedDetails : { reason: undefined };
					thread.stopped = true;
					thread.clearCallStack();
				});
			} else if (this.threads.has(data.threadId)) {
				// One thread is stopped, only update that thread.
				const thread = this.threads.get(data.threadId);
				thread.stoppedDetails = data.stoppedDetails;
				thread.clearCallStack();
				thread.stopped = true;
			}
		}
	}

	public clearThreads(removeThreads: boolean, reference: number = undefined): void {
		if (reference !== undefined && reference !== null) {
			if (this.threads.has(reference)) {
				const thread = this.threads.get(reference);
				thread.clearCallStack();
				thread.stoppedDetails = undefined;
				thread.stopped = false;

				if (removeThreads) {
					this.threads.delete(reference);
				}
			}
		} else {
			this.threads.forEach(thread => {
				thread.clearCallStack();
				thread.stoppedDetails = undefined;
				thread.stopped = false;
			});

			if (removeThreads) {
				this.threads.clear();
				ExpressionContainer.allValues.clear();
			}
		}
	}

	public completions(frameId: number, text: string, position: Position, overwriteBefore: number): TPromise<ISuggestion[]> {
		if (!this.raw.capabilities.supportsCompletionsRequest) {
			return TPromise.as([]);
		}

		return this.raw.completions({
			frameId,
			text,
			column: position.column,
			line: position.lineNumber
		}).then(response => {
			const result: ISuggestion[] = [];
			if (response && response.body && response.body.targets) {
				response.body.targets.forEach(item => {
					if (item && item.label) {
						result.push({
							label: item.label,
							insertText: item.text || item.label,
							type: item.type,
							filterText: item.start && item.length && text.substr(item.start, item.length).concat(item.label),
							overwriteBefore: item.length || overwriteBefore
						});
					}
				});
			}

			return result;
		}, () => []);
	}
}
