/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { PositionOffsetTransformerBase } from './positionToOffset.js';
export function getPositionOffsetTransformerFromTextModel(textModel) {
    return new PositionOffsetTransformerWithTextModel(textModel);
}
class PositionOffsetTransformerWithTextModel extends PositionOffsetTransformerBase {
    constructor(_textModel) {
        super();
        this._textModel = _textModel;
    }
    getOffset(position) {
        return this._textModel.getOffsetAt(position);
    }
    getPosition(offset) {
        return this._textModel.getPositionAt(offset);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0UG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lckZyb21UZXh0TW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2NvcmUvdGV4dC9nZXRQb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyRnJvbVRleHRNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUV0RSxNQUFNLFVBQVUseUNBQXlDLENBQUMsU0FBcUI7SUFDOUUsT0FBTyxJQUFJLHNDQUFzQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQzlELENBQUM7QUFFRCxNQUFNLHNDQUF1QyxTQUFRLDZCQUE2QjtJQUNqRixZQUE2QixVQUFzQjtRQUNsRCxLQUFLLEVBQUUsQ0FBQztRQURvQixlQUFVLEdBQVYsVUFBVSxDQUFZO0lBRW5ELENBQUM7SUFFUSxTQUFTLENBQUMsUUFBa0I7UUFDcEMsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRVEsV0FBVyxDQUFDLE1BQWM7UUFDbEMsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM5QyxDQUFDO0NBQ0QifQ==