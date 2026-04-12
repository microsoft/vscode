/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { AbstractText } from '../../../../common/core/text/abstractText.js';
import { TextLength } from '../../../../common/core/text/textLength.js';
/**
 * An immutable view of a text model at a specific version.
 * Like TextModelText but throws if the underlying model has changed.
 * This ensures data read from the reference is consistent with
 * the version at construction time.
 */
export class TextModelValueReference extends AbstractText {
    static snapshot(textModel) {
        return new TextModelValueReference(textModel);
    }
    constructor(_textModel) {
        super();
        this._textModel = _textModel;
        this._version = _textModel.getVersionId();
    }
    get uri() {
        return this._textModel.uri;
    }
    get version() {
        return this._version;
    }
    _assertValid() {
        if (this._textModel.getVersionId() !== this._version) {
            onUnexpectedError(new Error(`TextModel has changed: expected version ${this._version}, got ${this._textModel.getVersionId()}`));
            // TODO: throw here!
        }
    }
    targets(textModel) {
        return this._textModel.uri.toString() === textModel.uri.toString();
    }
    getValueOfRange(range) {
        this._assertValid();
        return this._textModel.getValueInRange(range);
    }
    getLineLength(lineNumber) {
        this._assertValid();
        return this._textModel.getLineLength(lineNumber);
    }
    get length() {
        this._assertValid();
        const lastLineNumber = this._textModel.getLineCount();
        const lastLineLen = this._textModel.getLineLength(lastLineNumber);
        return new TextLength(lastLineNumber - 1, lastLineLen);
    }
    getEOL() {
        this._assertValid();
        return this._textModel.getEOL();
    }
    getPositionAt(offset) {
        this._assertValid();
        return this._textModel.getPositionAt(offset);
    }
    getValueInRange(range) {
        this._assertValid();
        return this._textModel.getValueInRange(range);
    }
    getVersionId() {
        return this._version;
    }
    dangerouslyGetUnderlyingModel() {
        return this._textModel;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL21vZGVsL3RleHRNb2RlbFZhbHVlUmVmZXJlbmNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBSXpFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFHeEU7Ozs7O0dBS0c7QUFDSCxNQUFNLE9BQU8sdUJBQXdCLFNBQVEsWUFBWTtJQUd4RCxNQUFNLENBQUMsUUFBUSxDQUFDLFNBQXFCO1FBQ3BDLE9BQU8sSUFBSSx1QkFBdUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRUQsWUFBcUMsVUFBc0I7UUFDMUQsS0FBSyxFQUFFLENBQUM7UUFENEIsZUFBVSxHQUFWLFVBQVUsQ0FBWTtRQUUxRCxJQUFJLENBQUMsUUFBUSxHQUFHLFVBQVUsQ0FBQyxZQUFZLEVBQUUsQ0FBQztJQUMzQyxDQUFDO0lBRUQsSUFBSSxHQUFHO1FBQ04sT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQztJQUM1QixDQUFDO0lBRUQsSUFBSSxPQUFPO1FBQ1YsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ3RCLENBQUM7SUFFTyxZQUFZO1FBQ25CLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLEVBQUUsS0FBSyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDdEQsaUJBQWlCLENBQUMsSUFBSSxLQUFLLENBQUMsMkNBQTJDLElBQUksQ0FBQyxRQUFRLFNBQVMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNoSSxvQkFBb0I7UUFDckIsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLENBQUMsU0FBcUI7UUFDNUIsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsS0FBSyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ3BFLENBQUM7SUFFUSxlQUFlLENBQUMsS0FBWTtRQUNwQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDcEIsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRVEsYUFBYSxDQUFDLFVBQWtCO1FBQ3hDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNwQixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFRCxJQUFJLE1BQU07UUFDVCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDcEIsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUN0RCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUNsRSxPQUFPLElBQUksVUFBVSxDQUFDLGNBQWMsR0FBRyxDQUFDLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUVELE1BQU07UUFDTCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDcEIsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ2pDLENBQUM7SUFFRCxhQUFhLENBQUMsTUFBYztRQUMzQixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDcEIsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQsZUFBZSxDQUFDLEtBQVk7UUFDM0IsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVELFlBQVk7UUFDWCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDdEIsQ0FBQztJQUVELDZCQUE2QjtRQUM1QixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUM7SUFDeEIsQ0FBQztDQUNEIn0=