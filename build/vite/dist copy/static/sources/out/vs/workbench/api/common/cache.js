/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class Cache {
    static { this.enableDebugLogging = false; }
    constructor(id) {
        this.id = id;
        this._data = new Map();
        this._idPool = 1;
    }
    add(item) {
        const id = this._idPool++;
        this._data.set(id, item);
        this.logDebugInfo();
        return id;
    }
    get(pid, id) {
        return this._data.has(pid) ? this._data.get(pid)[id] : undefined;
    }
    delete(id) {
        this._data.delete(id);
        this.logDebugInfo();
    }
    logDebugInfo() {
        if (!Cache.enableDebugLogging) {
            return;
        }
        console.log(`${this.id} cache size - ${this._data.size}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9jYWNoZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxNQUFNLE9BQU8sS0FBSzthQUVPLHVCQUFrQixHQUFHLEtBQUssQUFBUixDQUFTO0lBS25ELFlBQ2tCLEVBQVU7UUFBVixPQUFFLEdBQUYsRUFBRSxDQUFRO1FBSlgsVUFBSyxHQUFHLElBQUksR0FBRyxFQUF3QixDQUFDO1FBQ2pELFlBQU8sR0FBRyxDQUFDLENBQUM7SUFJaEIsQ0FBQztJQUVMLEdBQUcsQ0FBQyxJQUFrQjtRQUNyQixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDMUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNwQixPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCxHQUFHLENBQUMsR0FBVyxFQUFFLEVBQVU7UUFDMUIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUNuRSxDQUFDO0lBRUQsTUFBTSxDQUFDLEVBQVU7UUFDaEIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdEIsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO0lBQ3JCLENBQUM7SUFFTyxZQUFZO1FBQ25CLElBQUksQ0FBQyxLQUFLLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUMvQixPQUFPO1FBQ1IsQ0FBQztRQUNELE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsRUFBRSxpQkFBaUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQzNELENBQUMifQ==