/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var EditContext;
(function (EditContext) {
    /**
     * Create an edit context.
     */
    function create(window, options) {
        return new window.EditContext(options);
    }
    EditContext.create = create;
})(EditContext || (EditContext = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdENvbnRleHRGYWN0b3J5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvY29udHJvbGxlci9lZGl0Q29udGV4dC9uYXRpdmUvZWRpdENvbnRleHRGYWN0b3J5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE1BQU0sS0FBVyxXQUFXLENBUTNCO0FBUkQsV0FBaUIsV0FBVztJQUUzQjs7T0FFRztJQUNILFNBQWdCLE1BQU0sQ0FBQyxNQUFjLEVBQUUsT0FBeUI7UUFDL0QsT0FBTyxJQUFLLE1BQXFGLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3hILENBQUM7SUFGZSxrQkFBTSxTQUVyQixDQUFBO0FBQ0YsQ0FBQyxFQVJnQixXQUFXLEtBQVgsV0FBVyxRQVEzQiJ9