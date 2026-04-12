/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const editorFeatures = [];
/**
 * Registers an editor feature. Editor features will be instantiated only once, as soon as
 * the first code editor is instantiated.
 */
export function registerEditorFeature(ctor) {
    editorFeatures.push(ctor);
}
export function getEditorFeatures() {
    return editorFeatures.slice(0);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yRmVhdHVyZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2VkaXRvckZlYXR1cmVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBYWhHLE1BQU0sY0FBYyxHQUF3QixFQUFFLENBQUM7QUFFL0M7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLHFCQUFxQixDQUFvQyxJQUFvRDtJQUM1SCxjQUFjLENBQUMsSUFBSSxDQUFDLElBQXlCLENBQUMsQ0FBQztBQUNoRCxDQUFDO0FBRUQsTUFBTSxVQUFVLGlCQUFpQjtJQUNoQyxPQUFPLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDaEMsQ0FBQyJ9