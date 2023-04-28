/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ToggleStickyScroll, FocusStickyScroll, SelectEditor, SelectPreviousStickyScrollLine, SelectNextStickyScrollLine, GoToStickyScrollLine } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollActions';
import { StickyScrollController } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollController';
import { registerAction2 } from 'vs/platform/actions/common/actions';

registerEditorContribution(StickyScrollController.ID, StickyScrollController, EditorContributionInstantiation.AfterFirstRender);
registerAction2(ToggleStickyScroll);
registerAction2(FocusStickyScroll);
registerAction2(SelectPreviousStickyScrollLine);
registerAction2(SelectNextStickyScrollLine);
registerAction2(GoToStickyScrollLine);
registerAction2(SelectEditor);
