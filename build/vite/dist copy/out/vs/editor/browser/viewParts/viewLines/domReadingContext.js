/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class DomReadingContext {
    get didDomLayout() {
        return this._didDomLayout;
    }
    readClientRect() {
        if (!this._clientRectRead) {
            this._clientRectRead = true;
            const rect = this._domNode.getBoundingClientRect();
            this.markDidDomLayout();
            this._clientRectDeltaLeft = rect.left;
            const offsetWidth = this._domNode.offsetWidth;
            this._clientRectScale = offsetWidth > 0 ? rect.width / offsetWidth : 1;
        }
    }
    get clientRectDeltaLeft() {
        if (!this._clientRectRead) {
            this.readClientRect();
        }
        return this._clientRectDeltaLeft;
    }
    get clientRectScale() {
        if (!this._clientRectRead) {
            this.readClientRect();
        }
        return this._clientRectScale;
    }
    constructor(_domNode, endNode) {
        this._domNode = _domNode;
        this.endNode = endNode;
        this._didDomLayout = false;
        this._clientRectDeltaLeft = 0;
        this._clientRectScale = 1;
        this._clientRectRead = false;
    }
    markDidDomLayout() {
        this._didDomLayout = true;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG9tUmVhZGluZ0NvbnRleHQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci92aWV3UGFydHMvdmlld0xpbmVzL2RvbVJlYWRpbmdDb250ZXh0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE1BQU0sT0FBTyxpQkFBaUI7SUFPN0IsSUFBVyxZQUFZO1FBQ3RCLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQztJQUMzQixDQUFDO0lBRU8sY0FBYztRQUNyQixJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzNCLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1lBQzVCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUNuRCxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztZQUN0QyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQztZQUM5QyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsV0FBVyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4RSxDQUFDO0lBQ0YsQ0FBQztJQUVELElBQVcsbUJBQW1CO1FBQzdCLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDM0IsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3ZCLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxvQkFBb0IsQ0FBQztJQUNsQyxDQUFDO0lBRUQsSUFBVyxlQUFlO1FBQ3pCLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDM0IsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3ZCLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztJQUM5QixDQUFDO0lBRUQsWUFDa0IsUUFBcUIsRUFDdEIsT0FBb0I7UUFEbkIsYUFBUSxHQUFSLFFBQVEsQ0FBYTtRQUN0QixZQUFPLEdBQVAsT0FBTyxDQUFhO1FBcEM3QixrQkFBYSxHQUFZLEtBQUssQ0FBQztRQUMvQix5QkFBb0IsR0FBVyxDQUFDLENBQUM7UUFDakMscUJBQWdCLEdBQVcsQ0FBQyxDQUFDO1FBQzdCLG9CQUFlLEdBQVksS0FBSyxDQUFDO0lBbUN6QyxDQUFDO0lBRU0sZ0JBQWdCO1FBQ3RCLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO0lBQzNCLENBQUM7Q0FDRCJ9