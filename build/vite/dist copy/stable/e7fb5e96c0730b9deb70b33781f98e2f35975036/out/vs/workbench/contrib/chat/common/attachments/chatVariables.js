/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
export const isIChatRequestProblemsVariable = (obj) => typeof obj === 'object' && obj !== null && 'id' in obj && obj.id === 'vscode.problems';
export const IChatVariablesService = createDecorator('IChatVariablesService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFZhcmlhYmxlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFPaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBcUJoRyxNQUFNLENBQUMsTUFBTSw4QkFBOEIsR0FBRyxDQUFDLEdBQVksRUFBdUMsRUFBRSxDQUNuRyxPQUFPLEdBQUcsS0FBSyxRQUFRLElBQUksR0FBRyxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksR0FBRyxJQUFLLEdBQW9DLENBQUMsRUFBRSxLQUFLLGlCQUFpQixDQUFDO0FBWTFILE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLGVBQWUsQ0FBd0IsdUJBQXVCLENBQUMsQ0FBQyJ9