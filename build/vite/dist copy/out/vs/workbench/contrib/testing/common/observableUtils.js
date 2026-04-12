/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function onObservableChange(observable, callback) {
    const o = {
        beginUpdate() { },
        endUpdate() { },
        handlePossibleChange(observable) {
            observable.reportChanges();
        },
        handleChange(_observable, change) {
            callback(change);
        }
    };
    observable.addObserver(o);
    return {
        dispose() {
            observable.removeObserver(o);
        }
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2JzZXJ2YWJsZVV0aWxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9jb21tb24vb2JzZXJ2YWJsZVV0aWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBS2hHLE1BQU0sVUFBVSxrQkFBa0IsQ0FBSSxVQUE2QyxFQUFFLFFBQTRCO0lBQ2hILE1BQU0sQ0FBQyxHQUFjO1FBQ3BCLFdBQVcsS0FBSyxDQUFDO1FBQ2pCLFNBQVMsS0FBSyxDQUFDO1FBQ2Ysb0JBQW9CLENBQUMsVUFBVTtZQUM5QixVQUFVLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDNUIsQ0FBQztRQUNELFlBQVksQ0FBYyxXQUErQyxFQUFFLE1BQWU7WUFDekYsUUFBUSxDQUFDLE1BQXNCLENBQUMsQ0FBQztRQUNsQyxDQUFDO0tBQ0QsQ0FBQztJQUVGLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUIsT0FBTztRQUNOLE9BQU87WUFDTixVQUFVLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlCLENBQUM7S0FDRCxDQUFDO0FBQ0gsQ0FBQyJ9