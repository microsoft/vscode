/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { AbstractText } from '../../../../common/core/text/abstractText.js';
import { TextLength } from '../../../../common/core/text/textLength.js';
import { ITextModel } from '../../../../common/model.js';

/**
 * An immutable view of a text model at a specific version.
 * Like TextModelText but throws if the underlying model has changed.
 * This ensures data read from the reference is consistent with
 * the version at construction time.
 */
export class TextModelValueReference extends AbstractText {
	private readonly _version: number;

	static snapshot(textModel: ITextModel): TextModelValueReference {
		return new TextModelValueReference(textModel);
	}

	private constructor(private readonly _textModel: ITextModel) {
		super();
		this._version = _textModel.getVersionId();
	}

	get uri(): URI {
		return this._textModel.uri;
	}

	get version(): number {
		return this._version;
	}

	private _assertValid(): void {
		if (this._textModel.getVersionId() !== this._version) {
			onUnexpectedError(new Error(`TextModel has changed: expected version ${this._version}, got ${this._textModel.getVersionId()}`));
			// TODO: throw here!
		}
	}

	targets(textModel: ITextModel): boolean {
		return this._textModel.uri.toString() === textModel.uri.toString();
	}

	override getValueOfRange(range: Range): string {
		this._assertValid();
		return this._textModel.getValueInRange(range);
	}

	override getLineLength(lineNumber: number): number {
		this._assertValid();
		return this._textModel.getLineLength(lineNumber);
	}

	get length(): TextLength {
		this._assertValid();
		const lastLineNumber = this._textModel.getLineCount();
		const lastLineLen = this._textModel.getLineLength(lastLineNumber);
		return new TextLength(lastLineNumber - 1, lastLineLen);
	}

	getEOL(): string {
		this._assertValid();
		return this._textModel.getEOL();
	}

	getPositionAt(offset: number): Position {
		this._assertValid();
		return this._textModel.getPositionAt(offset);
	}

	getValueInRange(range: Range): string {
		this._assertValid();
		return this._textModel.getValueInRange(range);
	}

	getVersionId(): number {
		return this._version;
	}

	dangerouslyGetUnderlyingModel(): ITextModel {
		return this._textModel;
	}
}
