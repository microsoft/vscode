/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Can only be called with increasing values of `index`.
*/
export class MonotonousIndexTransformer {
    static fromMany(transformations) {
        // TODO improve performance by combining transformations first
        const transformers = transformations.map(t => new MonotonousIndexTransformer(t));
        return new CombinedIndexTransformer(transformers);
    }
    constructor(transformation) {
        this.transformation = transformation;
        this.idx = 0;
        this.offset = 0;
    }
    /**
     * Precondition: index >= previous-value-of(index).
     */
    transform(index) {
        let nextChange = this.transformation.replacements.at(this.idx);
        while (nextChange && nextChange.replaceRange.endExclusive <= index) {
            this.offset += nextChange.getLengthDelta();
            this.idx++;
            nextChange = this.transformation.replacements.at(this.idx);
        }
        // assert nextChange === undefined || index < nextChange.offset + nextChange.length
        if (nextChange && nextChange.replaceRange.start <= index) {
            // Offset is touched by the change
            return undefined;
        }
        return index + this.offset;
    }
}
export class CombinedIndexTransformer {
    constructor(transformers) {
        this.transformers = transformers;
    }
    transform(index) {
        for (const transformer of this.transformers) {
            const result = transformer.transform(index);
            if (result === undefined) {
                return undefined;
            }
            index = result;
        }
        return index;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXhUcmFuc2Zvcm1lci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0TWF0ZS9icm93c2VyL2luZGV4VHJhbnNmb3JtZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFRaEc7O0VBRUU7QUFDRixNQUFNLE9BQU8sMEJBQTBCO0lBQy9CLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBMEI7UUFDaEQsOERBQThEO1FBQzlELE1BQU0sWUFBWSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakYsT0FBTyxJQUFJLHdCQUF3QixDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFLRCxZQUE2QixjQUF1QjtRQUF2QixtQkFBYyxHQUFkLGNBQWMsQ0FBUztRQUg1QyxRQUFHLEdBQUcsQ0FBQyxDQUFDO1FBQ1IsV0FBTSxHQUFHLENBQUMsQ0FBQztJQUduQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxTQUFTLENBQUMsS0FBYTtRQUN0QixJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQy9ELE9BQU8sVUFBVSxJQUFJLFVBQVUsQ0FBQyxZQUFZLENBQUMsWUFBWSxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ3BFLElBQUksQ0FBQyxNQUFNLElBQUksVUFBVSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQzNDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNYLFVBQVUsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzVELENBQUM7UUFDRCxtRkFBbUY7UUFFbkYsSUFBSSxVQUFVLElBQUksVUFBVSxDQUFDLFlBQVksQ0FBQyxLQUFLLElBQUksS0FBSyxFQUFFLENBQUM7WUFDMUQsa0NBQWtDO1lBQ2xDLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxPQUFPLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQzVCLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyx3QkFBd0I7SUFDcEMsWUFDa0IsWUFBaUM7UUFBakMsaUJBQVksR0FBWixZQUFZLENBQXFCO0lBQy9DLENBQUM7SUFFTCxTQUFTLENBQUMsS0FBYTtRQUN0QixLQUFLLE1BQU0sV0FBVyxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUM3QyxNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzVDLElBQUksTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUMxQixPQUFPLFNBQVMsQ0FBQztZQUNsQixDQUFDO1lBQ0QsS0FBSyxHQUFHLE1BQU0sQ0FBQztRQUNoQixDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0NBQ0QifQ==