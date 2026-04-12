/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { observableValue } from '../../../../../base/common/observable.js';
export class TestEnablementModel {
    readEnabled(_key) {
        return 2 /* ContributionEnablementState.EnabledProfile */;
    }
    remove(_key) { }
    setEnabled(_key, _state) { }
}
export class TestMcpService {
    constructor() {
        this.servers = observableValue(this, []);
        this.enablementModel = new TestEnablementModel();
        this.lazyCollectionState = observableValue(this, { state: 2 /* LazyCollectionState.AllKnown */, collections: [] });
    }
    resetCaches() {
    }
    resetTrust() {
    }
    cancelAutostart() {
    }
    autostart() {
        return observableValue(this, { working: false, starting: [], serversRequiringInteraction: [] });
    }
    activateCollections() {
        return Promise.resolve();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdE1jcFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvdGVzdC9jb21tb24vdGVzdE1jcFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBSTNFLE1BQU0sT0FBTyxtQkFBbUI7SUFDL0IsV0FBVyxDQUFDLElBQVk7UUFDdkIsMERBQWtEO0lBQ25ELENBQUM7SUFDRCxNQUFNLENBQUMsSUFBWSxJQUFVLENBQUM7SUFDOUIsVUFBVSxDQUFDLElBQVksRUFBRSxNQUFtQyxJQUFVLENBQUM7Q0FDdkU7QUFFRCxNQUFNLE9BQU8sY0FBYztJQUEzQjtRQUVRLFlBQU8sR0FBRyxlQUFlLENBQXdCLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNsRCxvQkFBZSxHQUFxQixJQUFJLG1CQUFtQixFQUFFLENBQUM7UUFnQnZFLHdCQUFtQixHQUFHLGVBQWUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxLQUFLLHNDQUE4QixFQUFFLFdBQVcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBSzlHLENBQUM7SUFwQkEsV0FBVztJQUVYLENBQUM7SUFDRCxVQUFVO0lBRVYsQ0FBQztJQUVELGVBQWU7SUFFZixDQUFDO0lBRUQsU0FBUztRQUNSLE9BQU8sZUFBZSxDQUFtQixJQUFJLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsMkJBQTJCLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNuSCxDQUFDO0lBSUQsbUJBQW1CO1FBQ2xCLE9BQU8sT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzFCLENBQUM7Q0FDRCJ9