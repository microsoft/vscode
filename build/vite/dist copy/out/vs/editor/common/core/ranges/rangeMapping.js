/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { findLastMonotonous } from '../../../../base/common/arraysFind.js';
import { Range } from '../range.js';
import { TextLength } from '../text/textLength.js';
/**
 * Represents a list of mappings of ranges from one document to another.
 */
export class RangeMapping {
    constructor(mappings) {
        this.mappings = mappings;
    }
    mapPosition(position) {
        const mapping = findLastMonotonous(this.mappings, m => m.original.getStartPosition().isBeforeOrEqual(position));
        if (!mapping) {
            return PositionOrRange.position(position);
        }
        if (mapping.original.containsPosition(position)) {
            return PositionOrRange.range(mapping.modified);
        }
        const l = TextLength.betweenPositions(mapping.original.getEndPosition(), position);
        return PositionOrRange.position(l.addToPosition(mapping.modified.getEndPosition()));
    }
    mapRange(range) {
        const start = this.mapPosition(range.getStartPosition());
        const end = this.mapPosition(range.getEndPosition());
        return Range.fromPositions(start.range?.getStartPosition() ?? start.position, end.range?.getEndPosition() ?? end.position);
    }
    reverse() {
        return new RangeMapping(this.mappings.map(mapping => mapping.reverse()));
    }
}
export class SingleRangeMapping {
    constructor(original, modified) {
        this.original = original;
        this.modified = modified;
    }
    reverse() {
        return new SingleRangeMapping(this.modified, this.original);
    }
    toString() {
        return `${this.original.toString()} -> ${this.modified.toString()}`;
    }
}
export class PositionOrRange {
    static position(position) {
        return new PositionOrRange(position, undefined);
    }
    static range(range) {
        return new PositionOrRange(undefined, range);
    }
    constructor(position, range) {
        this.position = position;
        this.range = range;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFuZ2VNYXBwaW5nLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9jb3JlL3Jhbmdlcy9yYW5nZU1hcHBpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFM0UsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUNwQyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFbkQ7O0dBRUc7QUFDSCxNQUFNLE9BQU8sWUFBWTtJQUN4QixZQUE0QixRQUF1QztRQUF2QyxhQUFRLEdBQVIsUUFBUSxDQUErQjtJQUNuRSxDQUFDO0lBRUQsV0FBVyxDQUFDLFFBQWtCO1FBQzdCLE1BQU0sT0FBTyxHQUFHLGtCQUFrQixDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDaEgsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2QsT0FBTyxlQUFlLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzNDLENBQUM7UUFDRCxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUNqRCxPQUFPLGVBQWUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFDRCxNQUFNLENBQUMsR0FBRyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxjQUFjLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNuRixPQUFPLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNyRixDQUFDO0lBRUQsUUFBUSxDQUFDLEtBQVk7UUFDcEIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDckQsT0FBTyxLQUFLLENBQUMsYUFBYSxDQUN6QixLQUFLLENBQUMsS0FBSyxFQUFFLGdCQUFnQixFQUFFLElBQUksS0FBSyxDQUFDLFFBQVMsRUFDbEQsR0FBRyxDQUFDLEtBQUssRUFBRSxjQUFjLEVBQUUsSUFBSSxHQUFHLENBQUMsUUFBUyxDQUM1QyxDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU87UUFDTixPQUFPLElBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxRSxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sa0JBQWtCO0lBQzlCLFlBQ2lCLFFBQWUsRUFDZixRQUFlO1FBRGYsYUFBUSxHQUFSLFFBQVEsQ0FBTztRQUNmLGFBQVEsR0FBUixRQUFRLENBQU87SUFFaEMsQ0FBQztJQUVELE9BQU87UUFDTixPQUFPLElBQUksa0JBQWtCLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDN0QsQ0FBQztJQUVELFFBQVE7UUFDUCxPQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7SUFDckUsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLGVBQWU7SUFDcEIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFrQjtRQUN4QyxPQUFPLElBQUksZUFBZSxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFZO1FBQy9CLE9BQU8sSUFBSSxlQUFlLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFRCxZQUNpQixRQUE4QixFQUM5QixLQUF3QjtRQUR4QixhQUFRLEdBQVIsUUFBUSxDQUFzQjtRQUM5QixVQUFLLEdBQUwsS0FBSyxDQUFtQjtJQUNyQyxDQUFDO0NBQ0wifQ==