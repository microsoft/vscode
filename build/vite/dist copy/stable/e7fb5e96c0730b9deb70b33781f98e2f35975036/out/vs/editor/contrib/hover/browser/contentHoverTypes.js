/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class ContentHoverResult {
    constructor(hoverParts, isComplete, options) {
        this.hoverParts = hoverParts;
        this.isComplete = isComplete;
        this.options = options;
    }
    filter(anchor) {
        const filteredHoverParts = this.hoverParts.filter((m) => m.isValidForHoverAnchor(anchor));
        if (filteredHoverParts.length === this.hoverParts.length) {
            return this;
        }
        return new FilteredContentHoverResult(this, filteredHoverParts, this.isComplete, this.options);
    }
}
export class FilteredContentHoverResult extends ContentHoverResult {
    constructor(original, messages, isComplete, options) {
        super(messages, isComplete, options);
        this.original = original;
    }
    filter(anchor) {
        return this.original.filter(anchor);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudEhvdmVyVHlwZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9ob3Zlci9icm93c2VyL2NvbnRlbnRIb3ZlclR5cGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBS2hHLE1BQU0sT0FBTyxrQkFBa0I7SUFFOUIsWUFDaUIsVUFBd0IsRUFDeEIsVUFBbUIsRUFDbkIsT0FBb0M7UUFGcEMsZUFBVSxHQUFWLFVBQVUsQ0FBYztRQUN4QixlQUFVLEdBQVYsVUFBVSxDQUFTO1FBQ25CLFlBQU8sR0FBUCxPQUFPLENBQTZCO0lBQ2pELENBQUM7SUFFRSxNQUFNLENBQUMsTUFBbUI7UUFDaEMsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDMUYsSUFBSSxrQkFBa0IsQ0FBQyxNQUFNLEtBQUssSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMxRCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxPQUFPLElBQUksMEJBQTBCLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2hHLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTywwQkFBMkIsU0FBUSxrQkFBa0I7SUFFakUsWUFDa0IsUUFBNEIsRUFDN0MsUUFBc0IsRUFDdEIsVUFBbUIsRUFDbkIsT0FBb0M7UUFFcEMsS0FBSyxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFMcEIsYUFBUSxHQUFSLFFBQVEsQ0FBb0I7SUFNOUMsQ0FBQztJQUVlLE1BQU0sQ0FBQyxNQUFtQjtRQUN6QyxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3JDLENBQUM7Q0FDRCJ9