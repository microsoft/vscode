/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// import * as DOM from 'vs/base/browser/dom';
class NotebookLogger {
    constructor() {
        this._frameId = 0;
        this._domFrameLog();
    }
    _domFrameLog() {
        // DOM.scheduleAtNextAnimationFrame(() => {
        // 	this._frameId++;
        // 	this._domFrameLog();
        // }, 1000000);
    }
    debug(...args) {
        const date = new Date();
        console.log(`${date.getSeconds()}:${date.getMilliseconds().toString().padStart(3, '0')}`, `frame #${this._frameId}: `, ...args);
    }
}
const instance = new NotebookLogger();
export function notebookDebug(...args) {
    instance.debug(...args);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tMb2dnZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL25vdGVib29rTG9nZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLDhDQUE4QztBQUU5QyxNQUFNLGNBQWM7SUFDbkI7UUFHUSxhQUFRLEdBQUcsQ0FBQyxDQUFDO1FBRnBCLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztJQUNyQixDQUFDO0lBRU8sWUFBWTtRQUNuQiwyQ0FBMkM7UUFDM0Msb0JBQW9CO1FBRXBCLHdCQUF3QjtRQUN4QixlQUFlO0lBQ2hCLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxJQUFlO1FBQ3ZCLE1BQU0sSUFBSSxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7UUFDeEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRSxFQUFFLFVBQVUsSUFBSSxDQUFDLFFBQVEsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7SUFDakksQ0FBQztDQUNEO0FBRUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztBQUN0QyxNQUFNLFVBQVUsYUFBYSxDQUFDLEdBQUcsSUFBZTtJQUMvQyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7QUFDekIsQ0FBQyJ9