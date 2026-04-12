/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class BracketInfo {
    constructor(range, 
    /** 0-based level */
    nestingLevel, nestingLevelOfEqualBracketType, isInvalid) {
        this.range = range;
        this.nestingLevel = nestingLevel;
        this.nestingLevelOfEqualBracketType = nestingLevelOfEqualBracketType;
        this.isInvalid = isInvalid;
    }
}
export class BracketPairInfo {
    constructor(range, openingBracketRange, closingBracketRange, 
    /** 0-based */
    nestingLevel, nestingLevelOfEqualBracketType, bracketPairNode) {
        this.range = range;
        this.openingBracketRange = openingBracketRange;
        this.closingBracketRange = closingBracketRange;
        this.nestingLevel = nestingLevel;
        this.nestingLevelOfEqualBracketType = nestingLevelOfEqualBracketType;
        this.bracketPairNode = bracketPairNode;
    }
    get openingBracketInfo() {
        return this.bracketPairNode.openingBracket.bracketInfo;
    }
    get closingBracketInfo() {
        return this.bracketPairNode.closingBracket?.bracketInfo;
    }
}
export class BracketPairWithMinIndentationInfo extends BracketPairInfo {
    constructor(range, openingBracketRange, closingBracketRange, 
    /**
     * 0-based
    */
    nestingLevel, nestingLevelOfEqualBracketType, bracketPairNode, 
    /**
     * -1 if not requested, otherwise the size of the minimum indentation in the bracket pair in terms of visible columns.
    */
    minVisibleColumnIndentation) {
        super(range, openingBracketRange, closingBracketRange, nestingLevel, nestingLevelOfEqualBracketType, bracketPairNode);
        this.minVisibleColumnIndentation = minVisibleColumnIndentation;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dE1vZGVsQnJhY2tldFBhaXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi90ZXh0TW9kZWxCcmFja2V0UGFpcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFzRWhHLE1BQU0sT0FBTyxXQUFXO0lBQ3ZCLFlBQ2lCLEtBQVk7SUFDNUIsb0JBQW9CO0lBQ0osWUFBb0IsRUFDcEIsOEJBQXNDLEVBQ3RDLFNBQWtCO1FBSmxCLFVBQUssR0FBTCxLQUFLLENBQU87UUFFWixpQkFBWSxHQUFaLFlBQVksQ0FBUTtRQUNwQixtQ0FBOEIsR0FBOUIsOEJBQThCLENBQVE7UUFDdEMsY0FBUyxHQUFULFNBQVMsQ0FBUztJQUMvQixDQUFDO0NBQ0w7QUFFRCxNQUFNLE9BQU8sZUFBZTtJQUMzQixZQUNpQixLQUFZLEVBQ1osbUJBQTBCLEVBQzFCLG1CQUFzQztJQUN0RCxjQUFjO0lBQ0UsWUFBb0IsRUFDcEIsOEJBQXNDLEVBQ3JDLGVBQTRCO1FBTjdCLFVBQUssR0FBTCxLQUFLLENBQU87UUFDWix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQU87UUFDMUIsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFtQjtRQUV0QyxpQkFBWSxHQUFaLFlBQVksQ0FBUTtRQUNwQixtQ0FBOEIsR0FBOUIsOEJBQThCLENBQVE7UUFDckMsb0JBQWUsR0FBZixlQUFlLENBQWE7SUFHOUMsQ0FBQztJQUVELElBQVcsa0JBQWtCO1FBQzVCLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxjQUFjLENBQUMsV0FBaUMsQ0FBQztJQUM5RSxDQUFDO0lBRUQsSUFBVyxrQkFBa0I7UUFDNUIsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDLGNBQWMsRUFBRSxXQUE2QyxDQUFDO0lBQzNGLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxpQ0FBa0MsU0FBUSxlQUFlO0lBQ3JFLFlBQ0MsS0FBWSxFQUNaLG1CQUEwQixFQUMxQixtQkFBc0M7SUFDdEM7O01BRUU7SUFDRixZQUFvQixFQUNwQiw4QkFBc0MsRUFDdEMsZUFBNEI7SUFDNUI7O01BRUU7SUFDYywyQkFBbUM7UUFFbkQsS0FBSyxDQUFDLEtBQUssRUFBRSxtQkFBbUIsRUFBRSxtQkFBbUIsRUFBRSxZQUFZLEVBQUUsOEJBQThCLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFGdEcsZ0NBQTJCLEdBQTNCLDJCQUEyQixDQUFRO0lBR3BELENBQUM7Q0FDRCJ9