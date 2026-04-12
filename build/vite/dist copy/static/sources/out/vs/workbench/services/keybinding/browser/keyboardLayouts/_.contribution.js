/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class KeyboardLayoutContribution {
    static { this.INSTANCE = new KeyboardLayoutContribution(); }
    get layoutInfos() {
        return this._layoutInfos;
    }
    constructor() {
        this._layoutInfos = [];
    }
    registerKeyboardLayout(layout) {
        this._layoutInfos.push(layout);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiXy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMva2V5YmluZGluZy9icm93c2VyL2tleWJvYXJkTGF5b3V0cy9fLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxNQUFNLE9BQU8sMEJBQTBCO2FBQ2YsYUFBUSxHQUErQixJQUFJLDBCQUEwQixFQUFFLEFBQS9ELENBQWdFO0lBSS9GLElBQUksV0FBVztRQUNkLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQztJQUMxQixDQUFDO0lBRUQ7UUFOUSxpQkFBWSxHQUFrQixFQUFFLENBQUM7SUFPekMsQ0FBQztJQUVELHNCQUFzQixDQUFDLE1BQW1CO1FBQ3pDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2hDLENBQUMifQ==