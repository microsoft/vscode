/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Lazy } from '../../../common/lazy.js';
const nullHoverDelegateFactory = () => ({
    get delay() { return -1; },
    dispose: () => { },
    showHover: () => { return undefined; },
});
let hoverDelegateFactory = nullHoverDelegateFactory;
const defaultHoverDelegateMouse = new Lazy(() => hoverDelegateFactory('mouse', false));
const defaultHoverDelegateElement = new Lazy(() => hoverDelegateFactory('element', false));
// TODO: Remove when getDefaultHoverDelegate is no longer used
export function setHoverDelegateFactory(hoverDelegateProvider) {
    hoverDelegateFactory = hoverDelegateProvider;
}
// TODO: Refine type for use in new IHoverService interface
export function getDefaultHoverDelegate(placement) {
    if (placement === 'element') {
        return defaultHoverDelegateElement.value;
    }
    return defaultHoverDelegateMouse.value;
}
// TODO: Create equivalent in IHoverService
export function createInstantHoverDelegate() {
    // Creates a hover delegate with instant hover enabled.
    // This hover belongs to the consumer and requires the them to dispose it.
    // Instant hover only makes sense for 'element' placement.
    return hoverDelegateFactory('element', true);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRS9DLE1BQU0sd0JBQXdCLEdBQUcsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUN2QyxJQUFJLEtBQUssS0FBYSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsQyxPQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztJQUNsQixTQUFTLEVBQUUsR0FBRyxFQUFFLEdBQUcsT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0NBQ3RDLENBQUMsQ0FBQztBQUVILElBQUksb0JBQW9CLEdBQTBGLHdCQUF3QixDQUFDO0FBQzNJLE1BQU0seUJBQXlCLEdBQUcsSUFBSSxJQUFJLENBQWlCLEdBQUcsRUFBRSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ3ZHLE1BQU0sMkJBQTJCLEdBQUcsSUFBSSxJQUFJLENBQWlCLEdBQUcsRUFBRSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBRTNHLDhEQUE4RDtBQUM5RCxNQUFNLFVBQVUsdUJBQXVCLENBQUMscUJBQThHO0lBQ3JKLG9CQUFvQixHQUFHLHFCQUFxQixDQUFDO0FBQzlDLENBQUM7QUFFRCwyREFBMkQ7QUFDM0QsTUFBTSxVQUFVLHVCQUF1QixDQUFDLFNBQThCO0lBQ3JFLElBQUksU0FBUyxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQzdCLE9BQU8sMkJBQTJCLENBQUMsS0FBSyxDQUFDO0lBQzFDLENBQUM7SUFDRCxPQUFPLHlCQUF5QixDQUFDLEtBQUssQ0FBQztBQUN4QyxDQUFDO0FBRUQsMkNBQTJDO0FBQzNDLE1BQU0sVUFBVSwwQkFBMEI7SUFDekMsdURBQXVEO0lBQ3ZELDBFQUEwRTtJQUMxRSwwREFBMEQ7SUFDMUQsT0FBTyxvQkFBb0IsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDOUMsQ0FBQyJ9