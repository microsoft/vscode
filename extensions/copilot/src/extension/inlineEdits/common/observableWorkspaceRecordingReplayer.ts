/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { deserializeStringEdit, SerializedEdit } from '../../../platform/inlineEdits/common/dataTypes/editUtils';
import { LanguageId } from '../../../platform/inlineEdits/common/dataTypes/languageId';
import { IObservableDocument, MutableObservableDocument, MutableObservableWorkspace } from '../../../platform/inlineEdits/common/observableWorkspace';
import { deserializeOffsetRange, DocumentEventLogEntry, DocumentEventLogEntryData, LogEntry } from '../../../platform/workspaceRecorder/common/workspaceLog';
import { assert } from '../../../util/vs/base/common/assert';
import { BugIndicatingError } from '../../../util/vs/base/common/errors';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { assertReturnsDefined } from '../../../util/vs/base/common/types';
import { URI } from '../../../util/vs/base/common/uri';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';

export interface IRecordingInformation {
	log: readonly LogEntry[];
	nextUserEdit?: { relativePath: string; edit: SerializedEdit };
}

export class ObservableWorkspaceRecordingReplayer extends Disposable {
	private readonly _workspace = new MutableObservableWorkspace();
	public get workspace(): MutableObservableWorkspace { return this._workspace; }


	private _stepIdx = 0;
	public get stepIdx() { return this._stepIdx; }
	constructor(
		private readonly _recording: IRecordingInformation,
		private readonly _includeNextEditSelection: boolean = false,
	) {
		super();
	}

	private _lastId: DocumentId | undefined = undefined;
	private _repoRootUri: string | undefined = undefined;
	private readonly _documents = new Map<number, { id: DocumentId; workspaceRoot: string | undefined; initialized: boolean }>();

	private readonly _states = new Map<string, string>();


	private readonly _onDocumentEvent = this._register(new Emitter<{ logEntry: DocumentEventLogEntry; data: DocumentEventLogEntryData; doc: MutableObservableDocument }>());
	public readonly onDocumentEvent = this._onDocumentEvent.event;

	getPreviousLogEntry(): LogEntry | undefined {
		if (this._stepIdx === 0) {
			return undefined;
		}
		return this._recording.log[this._stepIdx - 1];
	}


	step(): boolean {
		return this._step((e, cont) => cont());
	}

	async finishReplaySimulateTime() {
		while (await this.stepSimulateTime()) {
			// noop
		}
	}

	public getLastTime(): number | undefined {
		return this._lastTime || 0;
	}

	private _lastTime: number | undefined = undefined;
	public stepSimulateTime(): Promise<boolean> {
		return new Promise(res => {
			const r = this._step((entry, cont) => {
				if ('time' in entry) {
					const diff = Math.max(0, this._lastTime !== undefined ? (entry.time - this._lastTime) : 0);
					this._lastTime = entry.time;
					setTimeout(() => {
						cont();
						res(true);
					}, diff);
				} else {
					cont();
					res(true);
				}
			});

			if (!r) {
				res(false);
			}
		});
	}

	private _step(cb: (entry: LogEntry, cont: () => void) => void): boolean {
		if (this._stepIdx === this._recording.log.length && this._includeNextEditSelection) {
			this._stepIdx++;

			const nextEdit = this._recording.nextUserEdit;
			if (!nextEdit) {
				return false;
			}
			// we assume that the next edit refers to the last document! This might be wrong.
			const range = deserializeStringEdit(nextEdit.edit).replacements[0]?.replaceRange;
			if (!this._lastId) {
				throw new BugIndicatingError();
			}
			this._workspace.getDocument(this._lastId)?.setSelection([range], undefined);
			return true;
		}

		if (this._stepIdx >= this._recording.log.length) {
			return false;
		}

		const entry = this._recording.log[this._stepIdx];
		this._stepIdx++;

		cb(entry, () => {
			if ('time' in entry) {
				this._lastTime = entry.time;
			}

			switch (entry.kind) {
				case 'opened': {
					break;
				}
				case 'header': {
					if (entry.repoRootUri !== undefined) {
						this._repoRootUri = entry.repoRootUri;
					}
					break;
				}
				case 'meta': {
					this._repoRootUri = (entry.data as any).repoRootUri;
					break;
				}
				case 'documentEncountered': {
					const pathUri = joinUriWithRelativePath(assertReturnsDefined(this._repoRootUri), entry.relativePath);
					const id = DocumentId.create(pathUri);
					this._documents.set(entry.id, { id: id, workspaceRoot: this._repoRootUri, initialized: false });
					break;
				}
				case 'setContent': {
					const doc = this._documents.get(entry.id);
					if (!doc) { throw new BugIndicatingError(); }

					if (doc.initialized) {
						const d = this._workspace.getDocument(doc.id);
						d!.setValue(new StringText(entry.content), undefined, entry.v);
					} else {
						doc.initialized = true;
						const d = this._workspace.addDocument({
							id: doc.id,
							workspaceRoot: doc.workspaceRoot ? URI.parse(doc.workspaceRoot) : undefined,
							initialValue: entry.content,
							languageId: guessLanguageId(doc.id)
						});
						d.setSelection([new OffsetRange(0, 0)]);
					}
					break;
				}
				case 'changed': {
					const doc = this._documents.get(entry.id);
					if (!doc || !doc.initialized) { throw new BugIndicatingError(); }

					const e = deserializeStringEdit(entry.edit);
					this._workspace.getDocument(doc.id)?.applyEdit(e, undefined, entry.v);
					this._lastId = doc.id;
					break;
				}
				case 'selectionChanged': {
					const doc = this._documents.get(entry.id);
					if (!doc || !doc.initialized) { throw new BugIndicatingError(); }

					const selection = entry.selection;
					const docFromWorkspace = this._workspace.getDocument(doc.id);
					assert(docFromWorkspace !== undefined, 'Document should be in workspace');
					docFromWorkspace.updateSelection(selection.map(s => deserializeOffsetRange(s)), undefined);

					this._lastId = doc.id;

					break;
				}
				case 'focused':
				case 'applicationStart': {
					break;
				}

				case 'storeContent': {
					const doc = this._documents.get(entry.id)!;
					this._states.set(entry.contentId, this._workspace.getDocument(doc.id)!.value.get().value);
					break;
				}
				case 'restoreContent': {
					const doc = this._documents.get(entry.id)!;
					const content = this._states.get(entry.contentId);
					if (!content) {
						throw new BugIndicatingError();
					}

					this._workspace.getDocument(doc.id)!.setValue(new StringText(content), undefined, entry.v);
					break;
				}
				case 'documentEvent': {
					const docId = this._documents.get(entry.id)!;
					const doc = this._workspace.getDocument(docId.id)!;
					const data = entry.data as DocumentEventLogEntryData;
					this._onDocumentEvent.fire({ logEntry: entry, data, doc });
					break;
				}
				case 'event': {
					break;
				}
				default:
					throw new BugIndicatingError(`'${entry.kind}' not supported`);
			}
		});


		return true;
	}

	stepTo(idx: number): boolean {
		while (this._stepIdx < idx) {
			if (!this.step()) {
				return false;
			}
		}
		return true;
	}

	stepUntilFirstDocument(): IObservableDocument | undefined {
		do {
			const docs = this.workspace.openDocuments.get();
			if (docs.length > 0) {
				return docs[0];
			}
		} while (this.step());

		return undefined;
	}

	replay(): { lastDocId: DocumentId } {
		while (this.step()) { }

		if (!this._lastId) {
			throw new BugIndicatingError();
		}

		return { lastDocId: this._lastId! };
	}
}

function joinUriWithRelativePath(baseUri: string, relativePath: string): string {
	// TODO@hediet: use return URI.parse(join(baseUri, relativePath).replaceAll('\\', '/'));
	if (baseUri.endsWith('/')) {
		baseUri = baseUri.substring(0, baseUri.length - 1);
	}
	return baseUri + '/' + relativePath.replaceAll('\\', '/');
}


// TODO: This should be centralized in languages.ts
function guessLanguageId(docId: DocumentId): LanguageId {
	const extension = docId.extension;

	const extensionToLanguageId: { [ext: string]: string | undefined } = {
		'.py': 'python',
		'.js': 'javascript',
		'.jsx': 'javascriptreact',
		'.html': 'html',
		'.htm': 'html',
		'.css': 'css',
		'.ts': 'typescript',
		'.tsx': 'typescriptreact',
		'.go': 'go',
		'.ruby': 'ruby',
		'.cs': 'csharp',
		'.c': 'cpp',
		'.cpp': 'cpp',
		'.h': 'cpp',
		'.hpp': 'cpp',
		'.java': 'java',
		'.rs': 'rust',
	};
	if (extensionToLanguageId[extension]) {
		return LanguageId.create(extensionToLanguageId[extension]);
	}

	return LanguageId.PlainText;
}
