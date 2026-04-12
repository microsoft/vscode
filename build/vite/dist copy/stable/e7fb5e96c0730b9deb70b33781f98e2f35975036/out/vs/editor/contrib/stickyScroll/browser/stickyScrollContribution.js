/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerEditorContribution } from '../../../browser/editorExtensions.js';
import { ToggleStickyScroll, FocusStickyScroll, SelectEditor, SelectPreviousStickyScrollLine, SelectNextStickyScrollLine, GoToStickyScrollLine } from './stickyScrollActions.js';
import { StickyScrollController } from './stickyScrollController.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
registerEditorContribution(StickyScrollController.ID, StickyScrollController, 1 /* EditorContributionInstantiation.AfterFirstRender */);
registerAction2(ToggleStickyScroll);
registerAction2(FocusStickyScroll);
registerAction2(SelectPreviousStickyScrollLine);
registerAction2(SelectNextStickyScrollLine);
registerAction2(GoToStickyScrollLine);
registerAction2(SelectEditor);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RpY2t5U2Nyb2xsQ29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvc3RpY2t5U2Nyb2xsL2Jyb3dzZXIvc3RpY2t5U2Nyb2xsQ29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBbUMsMEJBQTBCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLDhCQUE4QixFQUFFLDBCQUEwQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDakwsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDckUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRWpGLDBCQUEwQixDQUFDLHNCQUFzQixDQUFDLEVBQUUsRUFBRSxzQkFBc0IsMkRBQW1ELENBQUM7QUFDaEksZUFBZSxDQUFDLGtCQUFrQixDQUFDLENBQUM7QUFDcEMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFDbkMsZUFBZSxDQUFDLDhCQUE4QixDQUFDLENBQUM7QUFDaEQsZUFBZSxDQUFDLDBCQUEwQixDQUFDLENBQUM7QUFDNUMsZUFBZSxDQUFDLG9CQUFvQixDQUFDLENBQUM7QUFDdEMsZUFBZSxDQUFDLFlBQVksQ0FBQyxDQUFDIn0=