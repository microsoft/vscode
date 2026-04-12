/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class TestClipboardService {
    constructor() {
        this.text = undefined;
        this.findText = undefined;
        this.resources = undefined;
    }
    readImage() {
        throw new Error('Method not implemented.');
    }
    triggerPaste() {
        return Promise.resolve();
    }
    async writeText(text, type) {
        this.text = text;
    }
    async readText(type) {
        return this.text ?? '';
    }
    async readFindText() {
        return this.findText ?? '';
    }
    async writeFindText(text) {
        this.findText = text;
    }
    async writeResources(resources) {
        this.resources = resources;
    }
    async readResources() {
        return this.resources ?? [];
    }
    async hasResources() {
        return Array.isArray(this.resources) && this.resources.length > 0;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdENsaXBib2FyZFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9jbGlwYm9hcmQvdGVzdC9jb21tb24vdGVzdENsaXBib2FyZFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsTUFBTSxPQUFPLG9CQUFvQjtJQUFqQztRQU9TLFNBQUksR0FBdUIsU0FBUyxDQUFDO1FBY3JDLGFBQVEsR0FBdUIsU0FBUyxDQUFDO1FBVXpDLGNBQVMsR0FBc0IsU0FBUyxDQUFDO0lBYWxELENBQUM7SUEzQ0EsU0FBUztRQUNSLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBTUQsWUFBWTtRQUNYLE9BQU8sT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFFRCxLQUFLLENBQUMsU0FBUyxDQUFDLElBQVksRUFBRSxJQUFhO1FBQzFDLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQ2xCLENBQUM7SUFFRCxLQUFLLENBQUMsUUFBUSxDQUFDLElBQWE7UUFDM0IsT0FBTyxJQUFJLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztJQUN4QixDQUFDO0lBSUQsS0FBSyxDQUFDLFlBQVk7UUFDakIsT0FBTyxJQUFJLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRUQsS0FBSyxDQUFDLGFBQWEsQ0FBQyxJQUFZO1FBQy9CLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO0lBQ3RCLENBQUM7SUFJRCxLQUFLLENBQUMsY0FBYyxDQUFDLFNBQWdCO1FBQ3BDLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO0lBQzVCLENBQUM7SUFFRCxLQUFLLENBQUMsYUFBYTtRQUNsQixPQUFPLElBQUksQ0FBQyxTQUFTLElBQUksRUFBRSxDQUFDO0lBQzdCLENBQUM7SUFFRCxLQUFLLENBQUMsWUFBWTtRQUNqQixPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztJQUNuRSxDQUFDO0NBQ0QifQ==