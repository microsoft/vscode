/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class LocalProcessRunningLocation {
    constructor(affinity) {
        this.affinity = affinity;
        this.kind = 1 /* ExtensionHostKind.LocalProcess */;
    }
    equals(other) {
        return (this.kind === other.kind && this.affinity === other.affinity);
    }
    asString() {
        if (this.affinity === 0) {
            return 'LocalProcess';
        }
        return `LocalProcess${this.affinity}`;
    }
}
export class LocalWebWorkerRunningLocation {
    constructor(affinity) {
        this.affinity = affinity;
        this.kind = 2 /* ExtensionHostKind.LocalWebWorker */;
    }
    equals(other) {
        return (this.kind === other.kind && this.affinity === other.affinity);
    }
    asString() {
        if (this.affinity === 0) {
            return 'LocalWebWorker';
        }
        return `LocalWebWorker${this.affinity}`;
    }
}
export class RemoteRunningLocation {
    constructor() {
        this.kind = 3 /* ExtensionHostKind.Remote */;
        this.affinity = 0;
    }
    equals(other) {
        return (this.kind === other.kind);
    }
    asString() {
        return 'Remote';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxNQUFNLE9BQU8sMkJBQTJCO0lBRXZDLFlBQ2lCLFFBQWdCO1FBQWhCLGFBQVEsR0FBUixRQUFRLENBQVE7UUFGakIsU0FBSSwwQ0FBa0M7SUFHbEQsQ0FBQztJQUNFLE1BQU0sQ0FBQyxLQUErQjtRQUM1QyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3ZFLENBQUM7SUFDTSxRQUFRO1FBQ2QsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3pCLE9BQU8sY0FBYyxDQUFDO1FBQ3ZCLENBQUM7UUFDRCxPQUFPLGVBQWUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ3ZDLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyw2QkFBNkI7SUFFekMsWUFDaUIsUUFBZ0I7UUFBaEIsYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUZqQixTQUFJLDRDQUFvQztJQUdwRCxDQUFDO0lBQ0UsTUFBTSxDQUFDLEtBQStCO1FBQzVDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLEtBQUssQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLFFBQVEsS0FBSyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDdkUsQ0FBQztJQUNNLFFBQVE7UUFDZCxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDekIsT0FBTyxnQkFBZ0IsQ0FBQztRQUN6QixDQUFDO1FBQ0QsT0FBTyxpQkFBaUIsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ3pDLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxxQkFBcUI7SUFBbEM7UUFDaUIsU0FBSSxvQ0FBNEI7UUFDaEMsYUFBUSxHQUFHLENBQUMsQ0FBQztJQU85QixDQUFDO0lBTk8sTUFBTSxDQUFDLEtBQStCO1FBQzVDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBQ00sUUFBUTtRQUNkLE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7Q0FDRCJ9