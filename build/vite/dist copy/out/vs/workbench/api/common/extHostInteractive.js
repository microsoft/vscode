/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../base/common/uri.js';
import { ApiCommand, ApiCommandArgument, ApiCommandResult } from './extHostCommands.js';
export class ExtHostInteractive {
    constructor(mainContext, _extHostNotebooks, _textDocumentsAndEditors, _commands, _logService) {
        this._extHostNotebooks = _extHostNotebooks;
        this._textDocumentsAndEditors = _textDocumentsAndEditors;
        this._commands = _commands;
        const openApiCommand = new ApiCommand('interactive.open', '_interactive.open', 'Open interactive window and return notebook editor and input URI', [
            new ApiCommandArgument('showOptions', 'Show Options', v => true, v => v),
            new ApiCommandArgument('resource', 'Interactive resource Uri', v => true, v => v),
            new ApiCommandArgument('controllerId', 'Notebook controller Id', v => true, v => v),
            new ApiCommandArgument('title', 'Interactive editor title', v => true, v => v)
        ], new ApiCommandResult('Notebook and input URI', (v) => {
            _logService.debug('[ExtHostInteractive] open iw with notebook editor id', v.notebookEditorId);
            if (v.notebookEditorId !== undefined) {
                const editor = this._extHostNotebooks.getEditorById(v.notebookEditorId);
                _logService.debug('[ExtHostInteractive] notebook editor found', editor.id);
                return { notebookUri: URI.revive(v.notebookUri), inputUri: URI.revive(v.inputUri), notebookEditor: editor.apiEditor };
            }
            _logService.debug('[ExtHostInteractive] notebook editor not found, uris for the interactive document', v.notebookUri, v.inputUri);
            return { notebookUri: URI.revive(v.notebookUri), inputUri: URI.revive(v.inputUri) };
        }));
        this._commands.registerApiCommand(openApiCommand);
    }
    $willAddInteractiveDocument(uri, eol, languageId, notebookUri) {
        this._textDocumentsAndEditors.acceptDocumentsAndEditorsDelta({
            addedDocuments: [{
                    EOL: eol,
                    lines: [''],
                    languageId: languageId,
                    uri: uri,
                    isDirty: false,
                    versionId: 1,
                    encoding: 'utf8'
                }]
        });
    }
    $willRemoveInteractiveDocument(uri, notebookUri) {
        this._textDocumentsAndEditors.acceptDocumentsAndEditorsDelta({
            removedDocuments: [uri]
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEludGVyYWN0aXZlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdEludGVyYWN0aXZlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sNkJBQTZCLENBQUM7QUFHakUsT0FBTyxFQUFFLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxnQkFBZ0IsRUFBbUIsTUFBTSxzQkFBc0IsQ0FBQztBQUt6RyxNQUFNLE9BQU8sa0JBQWtCO0lBQzlCLFlBQ0MsV0FBeUIsRUFDakIsaUJBQTRDLEVBQzVDLHdCQUFvRCxFQUNwRCxTQUEwQixFQUNsQyxXQUF3QjtRQUhoQixzQkFBaUIsR0FBakIsaUJBQWlCLENBQTJCO1FBQzVDLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBNEI7UUFDcEQsY0FBUyxHQUFULFNBQVMsQ0FBaUI7UUFHbEMsTUFBTSxjQUFjLEdBQUcsSUFBSSxVQUFVLENBQ3BDLGtCQUFrQixFQUNsQixtQkFBbUIsRUFDbkIsa0VBQWtFLEVBQ2xFO1lBQ0MsSUFBSSxrQkFBa0IsQ0FBQyxhQUFhLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3hFLElBQUksa0JBQWtCLENBQUMsVUFBVSxFQUFFLDBCQUEwQixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2pGLElBQUksa0JBQWtCLENBQUMsY0FBYyxFQUFFLHdCQUF3QixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ25GLElBQUksa0JBQWtCLENBQUMsT0FBTyxFQUFFLDBCQUEwQixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1NBQzlFLEVBQ0QsSUFBSSxnQkFBZ0IsQ0FBMkosd0JBQXdCLEVBQUUsQ0FBQyxDQUFxRixFQUFFLEVBQUU7WUFDbFMsV0FBVyxDQUFDLEtBQUssQ0FBQyxzREFBc0QsRUFBRSxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUM5RixJQUFJLENBQUMsQ0FBQyxnQkFBZ0IsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDdEMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztnQkFDeEUsV0FBVyxDQUFDLEtBQUssQ0FBQyw0Q0FBNEMsRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzNFLE9BQU8sRUFBRSxXQUFXLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLGNBQWMsRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDdkgsQ0FBQztZQUNELFdBQVcsQ0FBQyxLQUFLLENBQUMsbUZBQW1GLEVBQUUsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbEksT0FBTyxFQUFFLFdBQVcsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztRQUNyRixDQUFDLENBQUMsQ0FDRixDQUFDO1FBQ0YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRUQsMkJBQTJCLENBQUMsR0FBa0IsRUFBRSxHQUFXLEVBQUUsVUFBa0IsRUFBRSxXQUEwQjtRQUMxRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsOEJBQThCLENBQUM7WUFDNUQsY0FBYyxFQUFFLENBQUM7b0JBQ2hCLEdBQUcsRUFBRSxHQUFHO29CQUNSLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQztvQkFDWCxVQUFVLEVBQUUsVUFBVTtvQkFDdEIsR0FBRyxFQUFFLEdBQUc7b0JBQ1IsT0FBTyxFQUFFLEtBQUs7b0JBQ2QsU0FBUyxFQUFFLENBQUM7b0JBQ1osUUFBUSxFQUFFLE1BQU07aUJBQ2hCLENBQUM7U0FDRixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsOEJBQThCLENBQUMsR0FBa0IsRUFBRSxXQUEwQjtRQUM1RSxJQUFJLENBQUMsd0JBQXdCLENBQUMsOEJBQThCLENBQUM7WUFDNUQsZ0JBQWdCLEVBQUUsQ0FBQyxHQUFHLENBQUM7U0FDdkIsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEIn0=