/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { IRecordingInformation } from '../../../src/extension/inlineEdits/common/observableWorkspaceRecordingReplayer';
import { DocumentId } from '../../../src/platform/inlineEdits/common/dataTypes/documentId';
import { RootedEdit } from '../../../src/platform/inlineEdits/common/dataTypes/edit';
import { deserializeStringEdit, serializeStringEdit } from '../../../src/platform/inlineEdits/common/dataTypes/editUtils';
import { ISerializedEdit } from '../../../src/platform/workspaceRecorder/common/workspaceLog';
import { JSONFile } from '../../../src/util/node/jsonFile';
import { CachedFunction } from '../../../src/util/vs/base/common/cache';
import { equalsIfDefined, thisEqualsC } from '../../../src/util/vs/base/common/equals';
import { isDefined } from '../../../src/util/vs/base/common/types';
import { StringEdit } from '../../../src/util/vs/editor/common/core/edits/stringEdit';
import { StringText } from '../../../src/util/vs/editor/common/core/text/abstractText';

export interface IInlineEditScoringService {
	scoreEdit(scoredEditsFilePath: string, context: ScoringContext, docId: DocumentId, editDocumentValue: StringText, edit: RootedEdit | undefined): Promise<EditScoreResult | undefined>;
}

/** JSON Serializable */
export type ScoringContext = { kind: 'unknown'; documentValueBeforeEdit: string } | { kind: 'recording'; recording: IRecordingInformation };

export type EditScoreResultCategory = 'bad' | 'valid' | 'nextEdit';

const USE_SIMPLE_SCORING = true;

export class EditScoreResult {
	constructor(
		public readonly category: EditScoreResultCategory,
		/**
		 * When comparing two edits with the same scoreCategory, the one with the higher score is considered better.
		 * The score does not convey any other meaning (such as its absolute value).
		 * Should be below 100.
		 */
		public readonly score: number,
	) { }

	toString() {
		return `${this.category}#${this.score}`;
	}

	getScoreValue(): number {
		if (USE_SIMPLE_SCORING) {
			switch (this.category) {
				case 'bad': return 0;
				case 'valid': return 0.1;
				case 'nextEdit': return 1;
			}
		} else {
			const getVal = () => {
				switch (this.category) {
					case 'bad': return 0;
					case 'valid': return 10 + (this.score / 100) * 3;
					case 'nextEdit': return 100 + 10 * (this.score / 100);
				}
			};
			const maxValue = 110;
			return Math.round(Math.min(getVal() / maxValue, maxValue) * 1000) / 1000;
		}
	}
}

class InlineEditScoringService implements IInlineEditScoringService {
	private readonly _scoredEdits = new CachedFunction(async (path: string) => {
		await mkdir(dirname(path), { recursive: true });
		const file = await JSONFile.readOrCreate<IScoredEdits | null>(path, null, '\t');

		return {
			scoredEdits: undefined as undefined | ScoredEdits,
			file,
		};
	});

	async scoreEdit(scoredEditsFilePath: string, context: ScoringContext, docId: DocumentId, editDocumentValue: StringText, edit: RootedEdit | undefined): Promise<EditScoreResult | undefined> {
		const existing = await this._scoredEdits.get(scoredEditsFilePath);

		let shouldWrite = false;

		if (!existing.scoredEdits) {
			const value = existing.file.value;
			if (!value) {
				existing.scoredEdits = ScoredEdits.create(context);
				shouldWrite = true; // first test run
			} else {
				existing.scoredEdits = ScoredEdits.fromJson(value, context);
				shouldWrite = existing.scoredEdits.removeUnscored(); // we deleted all unscored edits (might be re-added though)
				const shouldNormalizeExisting = false; // Edits are now normalized before adding to the score database.
				if (shouldNormalizeExisting) {
					shouldWrite = existing.scoredEdits.normalizeEdits(editDocumentValue.value) || shouldWrite;
				}
			}
		}

		const result = existing.scoredEdits.getScoreOrAddAsUnscored(docId, edit);
		if (!result) {
			shouldWrite = true; // edit was added as unscored
		}

		if (shouldWrite) {
			const newData = existing.scoredEdits.serialize();
			await existing.file.setValue(newData);
		}

		return result;
	}
}

class ScoredEdits {
	public static fromJson(data: IScoredEdits, scoringContext: ScoringContext): ScoredEdits {
		// TOD check if context matches!
		return new ScoredEdits(scoringContext, data.edits);
	}

	public static create(scoringContext: ScoringContext): ScoredEdits {
		return new ScoredEdits(scoringContext, []);
	}

	private _edits: IScoredEdit[];
	private _editMatchers: EditMatcher[] = [];

	private constructor(
		private readonly _scoringContext: ScoringContext,
		edits: IScoredEdit[],
	) {
		this._edits = edits;
		this._editMatchers = edits.map(e => new EditMatcher(e));
	}

	hasUnscored(): boolean {
		return this._edits.some(e => !isScoredEdit(e));
	}

	normalizeEdits(source: string): boolean {
		const existing = new Set<string>();

		this._edits = this._edits.map(e => {
			let n = e.edit ? deserializeStringEdit(e.edit).normalizeOnSource(source) : undefined;
			if (n?.isEmpty()) {
				n = undefined;
			}
			const key = e.documentUri + '#' + JSON.stringify(n?.toJson());
			if (existing.has(key)) {
				return null;
			}
			existing.add(key);

			return {
				...e,
				edit: n ? serializeStringEdit(n) : null,
			};
		}).filter(isDefined);

		this._editMatchers = this._edits.map(e => new EditMatcher(e));

		return true;
	}

	removeUnscored(): boolean {
		if (!this.hasUnscored()) {
			return false;
		}
		this._edits = this._edits.filter(e => isScoredEdit(e));
		this._editMatchers = this._editMatchers.filter(e => e.isScored());
		return true;
	}

	getScoreOrAddAsUnscored(docId: DocumentId, edit: RootedEdit | undefined): EditScoreResult | undefined {
		edit = edit?.normalize();
		if (edit?.edit.isEmpty()) {
			edit = undefined;
		}

		const documentUri = docId.uri;

		let existingEdit = this._editMatchers.find(e => e.matches(documentUri, edit));
		if (!existingEdit) {
			const e: IScoredEdit = {
				documentUri: documentUri,
				edit: edit ? serializeStringEdit(edit.edit) : null,
				score: 'unscored',
				scoreCategory: 'unscored',
			};
			const m = new EditMatcher(e);
			this._edits.push(e);
			this._editMatchers.push(m);

			existingEdit = m;
		}
		return existingEdit.getScore();
	}

	serialize(): IScoredEdits {
		return {
			...{
				'$web-editor.format-json': true,
				'$web-editor.default-url': 'https://microsoft.github.io/vscode-workbench-recorder-viewer/?editRating',
			},
			edits: this._edits,
			// Last, so that it is easier to review the file
			scoringContext: this._scoringContext,
		};
	}
}

class EditMatcher {
	public readonly documentUri = this.data.documentUri;
	public readonly edit: StringEdit | undefined;

	constructor(
		private readonly data: IScoredEdit,
	) {
		this.edit = data.edit ? deserializeStringEdit(data.edit) : undefined;
	}

	isScored(): boolean {
		return isScoredEdit(this.data);
	}

	getScore(): EditScoreResult | undefined {
		if (!isScoredEdit(this.data)) {
			return undefined;
		}
		return new EditScoreResult(this.data.scoreCategory, this.data.score);
	}

	matches(editDocumentUri: string, edit: RootedEdit | undefined): boolean {
		if (editDocumentUri !== this.documentUri) {
			return false;
		}
		// TODO improve! (check if strings after applied the edits are the same)
		return equalsIfDefined(this.edit, edit?.edit, thisEqualsC());
	}
}

/** JSON Serializable */
interface IScoredEdits {
	edits: IScoredEdit[];
	scoringContext: ScoringContext;
}

/** JSON Serializable */
interface IScoredEdit<TUnscored = 'unscored'> {
	documentUri: string;
	edit: ISerializedEdit | null;
	scoreCategory: EditScoreResultCategory | TUnscored;

	/**
	 * When comparing two edits with the same scoreCategory, the one with the higher score is considered better.
	 * The score does not convey any other meaning (such as its absolute value).
	 */
	score: number | TUnscored;
}

function isScoredEdit(edit: IScoredEdit<any>): edit is IScoredEdit<never> {
	return edit.score !== 'unscored' && edit.scoreCategory !== 'unscored';
}

// Has to be a singleton to avoid writing race conditions
export const inlineEditScoringService = new InlineEditScoringService();
