/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var LinePartMetadata;
(function (LinePartMetadata) {
    LinePartMetadata[LinePartMetadata["IS_WHITESPACE"] = 1] = "IS_WHITESPACE";
    LinePartMetadata[LinePartMetadata["PSEUDO_BEFORE"] = 2] = "PSEUDO_BEFORE";
    LinePartMetadata[LinePartMetadata["PSEUDO_AFTER"] = 4] = "PSEUDO_AFTER";
    LinePartMetadata[LinePartMetadata["IS_WHITESPACE_MASK"] = 1] = "IS_WHITESPACE_MASK";
    LinePartMetadata[LinePartMetadata["PSEUDO_BEFORE_MASK"] = 2] = "PSEUDO_BEFORE_MASK";
    LinePartMetadata[LinePartMetadata["PSEUDO_AFTER_MASK"] = 4] = "PSEUDO_AFTER_MASK";
})(LinePartMetadata || (LinePartMetadata = {}));
export class LinePart {
    constructor(
    /**
     * last char index of this token (not inclusive).
     */
    endIndex, type, metadata, containsRTL) {
        this.endIndex = endIndex;
        this.type = type;
        this.metadata = metadata;
        this.containsRTL = containsRTL;
        this._linePartBrand = undefined;
    }
    isWhitespace() {
        return (this.metadata & 1 /* LinePartMetadata.IS_WHITESPACE_MASK */ ? true : false);
    }
    isPseudoAfter() {
        return (this.metadata & 4 /* LinePartMetadata.PSEUDO_AFTER_MASK */ ? true : false);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluZVBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL3ZpZXdMYXlvdXQvbGluZVBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsTUFBTSxDQUFOLElBQWtCLGdCQVFqQjtBQVJELFdBQWtCLGdCQUFnQjtJQUNqQyx5RUFBaUIsQ0FBQTtJQUNqQix5RUFBaUIsQ0FBQTtJQUNqQix1RUFBZ0IsQ0FBQTtJQUVoQixtRkFBMEIsQ0FBQTtJQUMxQixtRkFBMEIsQ0FBQTtJQUMxQixpRkFBeUIsQ0FBQTtBQUMxQixDQUFDLEVBUmlCLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFRakM7QUFFRCxNQUFNLE9BQU8sUUFBUTtJQUdwQjtJQUNDOztPQUVHO0lBQ2EsUUFBZ0IsRUFDaEIsSUFBWSxFQUNaLFFBQWdCLEVBQ2hCLFdBQW9CO1FBSHBCLGFBQVEsR0FBUixRQUFRLENBQVE7UUFDaEIsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUNaLGFBQVEsR0FBUixRQUFRLENBQVE7UUFDaEIsZ0JBQVcsR0FBWCxXQUFXLENBQVM7UUFUckMsbUJBQWMsR0FBUyxTQUFTLENBQUM7SUFVN0IsQ0FBQztJQUVFLFlBQVk7UUFDbEIsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLDhDQUFzQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzdFLENBQUM7SUFFTSxhQUFhO1FBQ25CLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSw2Q0FBcUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM1RSxDQUFDO0NBQ0QifQ==