/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function isAutoApproveRule(rule) {
    return !!rule && 'sourceText' in rule;
}
export function isNpmScriptAutoApproveRule(rule) {
    return !!rule && 'type' in rule && rule.type === 'npmScript';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVBbmFseXplci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL2NvbW1hbmRMaW5lQW5hbHl6ZXIvY29tbWFuZExpbmVBbmFseXplci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQXdCaEcsTUFBTSxVQUFVLGlCQUFpQixDQUFDLElBQThEO0lBQy9GLE9BQU8sQ0FBQyxDQUFDLElBQUksSUFBSSxZQUFZLElBQUksSUFBSSxDQUFDO0FBQ3ZDLENBQUM7QUFFRCxNQUFNLFVBQVUsMEJBQTBCLENBQUMsSUFBOEQ7SUFDeEcsT0FBTyxDQUFDLENBQUMsSUFBSSxJQUFJLE1BQU0sSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxXQUFXLENBQUM7QUFDOUQsQ0FBQyJ9