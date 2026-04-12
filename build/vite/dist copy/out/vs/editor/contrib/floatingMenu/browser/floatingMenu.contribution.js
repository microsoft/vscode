/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './floatingMenu.css';
import { registerEditorContribution } from '../../../browser/editorExtensions.js';
import { FloatingEditorToolbar } from './floatingMenu.js';
registerEditorContribution(FloatingEditorToolbar.ID, FloatingEditorToolbar, 1 /* EditorContributionInstantiation.AfterFirstRender */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmxvYXRpbmdNZW51LmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2Zsb2F0aW5nTWVudS9icm93c2VyL2Zsb2F0aW5nTWVudS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxvQkFBb0IsQ0FBQztBQUM1QixPQUFPLEVBQUUsMEJBQTBCLEVBQW1DLE1BQU0sc0NBQXNDLENBQUM7QUFDbkgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFMUQsMEJBQTBCLENBQUMscUJBQXFCLENBQUMsRUFBRSxFQUFFLHFCQUFxQiwyREFBbUQsQ0FBQyJ9