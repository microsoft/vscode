/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorOptions } from './common/config/editorOptions.js';
import { createMonacoBaseAPI } from './common/services/editorBaseApi.js';
import { createMonacoEditorAPI } from './standalone/browser/standaloneEditor.js';
import { createMonacoLanguagesAPI } from './standalone/browser/standaloneLanguages.js';
import { FormattingConflicts } from './contrib/format/browser/format.js';
import { getMonacoEnvironment } from '../base/browser/browser.js';
// Set defaults for standalone editor
EditorOptions.wrappingIndent.defaultValue = 0 /* WrappingIndent.None */;
EditorOptions.glyphMargin.defaultValue = false;
EditorOptions.autoIndent.defaultValue = 3 /* EditorAutoIndentStrategy.Advanced */;
EditorOptions.overviewRulerLanes.defaultValue = 2;
// We need to register a formatter selector which simply picks the first available formatter.
// See https://github.com/microsoft/monaco-editor/issues/2327
FormattingConflicts.setFormatterSelector((formatter, document, mode) => Promise.resolve(formatter[0]));
const api = createMonacoBaseAPI();
api.editor = createMonacoEditorAPI();
api.languages = createMonacoLanguagesAPI();
export const CancellationTokenSource = api.CancellationTokenSource;
export const Emitter = api.Emitter;
export const KeyCode = api.KeyCode;
export const KeyMod = api.KeyMod;
export const Position = api.Position;
export const Range = api.Range;
export const Selection = api.Selection;
export const SelectionDirection = api.SelectionDirection;
export const MarkerSeverity = api.MarkerSeverity;
export const MarkerTag = api.MarkerTag;
export const Uri = api.Uri;
export const Token = api.Token;
export const editor = api.editor;
export const languages = api.languages;
const monacoEnvironment = getMonacoEnvironment();
const globalWithAMD = globalThis;
if (monacoEnvironment?.globalAPI || (typeof globalWithAMD.define === 'function' && globalWithAMD.define.amd)) {
    globalWithAMD.monaco = api;
}
if (typeof globalWithAMD.require !== 'undefined' && typeof globalWithAMD.require.config === 'function') {
    globalWithAMD.require.config({
        ignoreDuplicateModules: [
            'vscode-languageserver-types',
            'vscode-languageserver-types/main',
            'vscode-languageserver-textdocument',
            'vscode-languageserver-textdocument/main',
            'vscode-nls',
            'vscode-nls/vscode-nls',
            'jsonc-parser',
            'jsonc-parser/main',
            'vscode-uri',
            'vscode-uri/index',
            'vs/basic-languages/typescript/typescript'
        ]
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yLmFwaS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9lZGl0b3IuYXBpLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxhQUFhLEVBQTRDLE1BQU0sa0NBQWtDLENBQUM7QUFDM0csT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDekUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDakYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdkYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDekUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFbEUscUNBQXFDO0FBQ3JDLGFBQWEsQ0FBQyxjQUFjLENBQUMsWUFBWSw4QkFBc0IsQ0FBQztBQUNoRSxhQUFhLENBQUMsV0FBVyxDQUFDLFlBQVksR0FBRyxLQUFLLENBQUM7QUFDL0MsYUFBYSxDQUFDLFVBQVUsQ0FBQyxZQUFZLDRDQUFvQyxDQUFDO0FBQzFFLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxZQUFZLEdBQUcsQ0FBQyxDQUFDO0FBRWxELDZGQUE2RjtBQUM3Riw2REFBNkQ7QUFDN0QsbUJBQW1CLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBRXZHLE1BQU0sR0FBRyxHQUFHLG1CQUFtQixFQUFFLENBQUM7QUFDbEMsR0FBRyxDQUFDLE1BQU0sR0FBRyxxQkFBcUIsRUFBRSxDQUFDO0FBQ3JDLEdBQUcsQ0FBQyxTQUFTLEdBQUcsd0JBQXdCLEVBQUUsQ0FBQztBQUMzQyxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxHQUFHLENBQUMsdUJBQXVCLENBQUM7QUFDbkUsTUFBTSxDQUFDLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUM7QUFDbkMsTUFBTSxDQUFDLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUM7QUFDbkMsTUFBTSxDQUFDLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7QUFDakMsTUFBTSxDQUFDLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUM7QUFDckMsTUFBTSxDQUFDLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUM7QUFDL0IsTUFBTSxDQUFDLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUM7QUFDdkMsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsR0FBRyxDQUFDLGtCQUFrQixDQUFDO0FBQ3pELE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMsY0FBYyxDQUFDO0FBQ2pELE1BQU0sQ0FBQyxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDO0FBQ3ZDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDO0FBQzNCLE1BQU0sQ0FBQyxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDO0FBQy9CLE1BQU0sQ0FBQyxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDO0FBQ2pDLE1BQU0sQ0FBQyxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDO0FBWXZDLE1BQU0saUJBQWlCLEdBQUcsb0JBQW9CLEVBQUUsQ0FBQztBQUNqRCxNQUFNLGFBQWEsR0FBRyxVQUEyQixDQUFDO0FBQ2xELElBQUksaUJBQWlCLEVBQUUsU0FBUyxJQUFJLENBQUMsT0FBTyxhQUFhLENBQUMsTUFBTSxLQUFLLFVBQVUsSUFBSSxhQUFhLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7SUFDOUcsYUFBYSxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUM7QUFDNUIsQ0FBQztBQUVELElBQUksT0FBTyxhQUFhLENBQUMsT0FBTyxLQUFLLFdBQVcsSUFBSSxPQUFPLGFBQWEsQ0FBQyxPQUFPLENBQUMsTUFBTSxLQUFLLFVBQVUsRUFBRSxDQUFDO0lBQ3hHLGFBQWEsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDO1FBQzVCLHNCQUFzQixFQUFFO1lBQ3ZCLDZCQUE2QjtZQUM3QixrQ0FBa0M7WUFDbEMsb0NBQW9DO1lBQ3BDLHlDQUF5QztZQUN6QyxZQUFZO1lBQ1osdUJBQXVCO1lBQ3ZCLGNBQWM7WUFDZCxtQkFBbUI7WUFDbkIsWUFBWTtZQUNaLGtCQUFrQjtZQUNsQiwwQ0FBMEM7U0FDMUM7S0FDRCxDQUFDLENBQUM7QUFDSixDQUFDIn0=