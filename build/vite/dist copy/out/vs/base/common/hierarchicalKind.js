/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class HierarchicalKind {
    static { this.sep = '.'; }
    static { this.None = new HierarchicalKind('@@none@@'); } // Special kind that matches nothing
    static { this.Empty = new HierarchicalKind(''); }
    constructor(value) {
        this.value = value;
    }
    equals(other) {
        return this.value === other.value;
    }
    contains(other) {
        return this.equals(other) || this.value === '' || other.value.startsWith(this.value + HierarchicalKind.sep);
    }
    intersects(other) {
        return this.contains(other) || other.contains(this);
    }
    append(...parts) {
        return new HierarchicalKind((this.value ? [this.value, ...parts] : parts).join(HierarchicalKind.sep));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGllcmFyY2hpY2FsS2luZC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2hpZXJhcmNoaWNhbEtpbmQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsTUFBTSxPQUFPLGdCQUFnQjthQUNMLFFBQUcsR0FBRyxHQUFHLENBQUM7YUFFVixTQUFJLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxHQUFDLG9DQUFvQzthQUM3RSxVQUFLLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUV4RCxZQUNpQixLQUFhO1FBQWIsVUFBSyxHQUFMLEtBQUssQ0FBUTtJQUMxQixDQUFDO0lBRUUsTUFBTSxDQUFDLEtBQXVCO1FBQ3BDLE9BQU8sSUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLLENBQUMsS0FBSyxDQUFDO0lBQ25DLENBQUM7SUFFTSxRQUFRLENBQUMsS0FBdUI7UUFDdEMsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDN0csQ0FBQztJQUVNLFVBQVUsQ0FBQyxLQUF1QjtRQUN4QyxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRU0sTUFBTSxDQUFDLEdBQUcsS0FBZTtRQUMvQixPQUFPLElBQUksZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDdkcsQ0FBQyJ9