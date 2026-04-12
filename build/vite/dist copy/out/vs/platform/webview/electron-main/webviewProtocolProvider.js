/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var WebviewProtocolProvider_1;
import { protocol } from 'electron';
import { COI, FileAccess, Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
let WebviewProtocolProvider = class WebviewProtocolProvider {
    static { WebviewProtocolProvider_1 = this; }
    static { this.validWebviewFilePaths = new Map([
        ['/index.html', { mime: 'text/html' }],
        ['/fake.html', { mime: 'text/html' }],
        ['/service-worker.js', { mime: 'application/javascript' }],
    ]); }
    constructor(_fileService) {
        this._fileService = _fileService;
        // Register the protocol for loading webview html
        const webviewHandler = this.handleWebviewRequest.bind(this);
        protocol.handle(Schemas.vscodeWebview, webviewHandler);
    }
    dispose() {
        protocol.unhandle(Schemas.vscodeWebview);
    }
    async handleWebviewRequest(request) {
        try {
            const uri = URI.parse(request.url);
            const entry = WebviewProtocolProvider_1.validWebviewFilePaths.get(uri.path);
            if (entry) {
                const relativeResourcePath = `vs/workbench/contrib/webview/browser/pre${uri.path}`;
                const url = FileAccess.asFileUri(relativeResourcePath);
                const content = await this._fileService.readFile(url);
                return new Response(content.value.buffer.buffer, {
                    headers: {
                        'Content-Type': entry.mime,
                        ...COI.getHeadersFromQuery(request.url),
                        'Cross-Origin-Resource-Policy': 'cross-origin',
                    }
                });
            }
            else {
                return new Response(null, { status: 403 });
            }
        }
        catch {
            // noop
        }
        return new Response(null, { status: 500 });
    }
};
WebviewProtocolProvider = WebviewProtocolProvider_1 = __decorate([
    __param(0, IFileService)
], WebviewProtocolProvider);
export { WebviewProtocolProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vidmlld1Byb3RvY29sUHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS93ZWJ2aWV3L2VsZWN0cm9uLW1haW4vd2Vidmlld1Byb3RvY29sUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFcEMsT0FBTyxFQUFtQixHQUFHLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFHcEQsSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBdUI7O2FBRXBCLDBCQUFxQixHQUFHLElBQUksR0FBRyxDQUFvQztRQUNqRixDQUFDLGFBQWEsRUFBRSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsQ0FBQztRQUN0QyxDQUFDLFlBQVksRUFBRSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsQ0FBQztRQUNyQyxDQUFDLG9CQUFvQixFQUFFLEVBQUUsSUFBSSxFQUFFLHdCQUF3QixFQUFFLENBQUM7S0FDMUQsQ0FBQyxBQUprQyxDQUlqQztJQUVILFlBQ2dDLFlBQTBCO1FBQTFCLGlCQUFZLEdBQVosWUFBWSxDQUFjO1FBRXpELGlEQUFpRDtRQUNqRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVELFFBQVEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRUQsT0FBTztRQUNOLFFBQVEsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFTyxLQUFLLENBQUMsb0JBQW9CLENBQUMsT0FBc0I7UUFDeEQsSUFBSSxDQUFDO1lBQ0osTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkMsTUFBTSxLQUFLLEdBQUcseUJBQXVCLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMxRSxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUNYLE1BQU0sb0JBQW9CLEdBQW9CLDJDQUEyQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3BHLE1BQU0sR0FBRyxHQUFHLFVBQVUsQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsQ0FBQztnQkFFdkQsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDdEQsT0FBTyxJQUFJLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFxQixFQUFFO29CQUMvRCxPQUFPLEVBQUU7d0JBQ1IsY0FBYyxFQUFFLEtBQUssQ0FBQyxJQUFJO3dCQUMxQixHQUFHLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDO3dCQUN2Qyw4QkFBOEIsRUFBRSxjQUFjO3FCQUM5QztpQkFDRCxDQUFDLENBQUM7WUFDSixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsT0FBTyxJQUFJLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztZQUM1QyxDQUFDO1FBQ0YsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNSLE9BQU87UUFDUixDQUFDO1FBQ0QsT0FBTyxJQUFJLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUM1QyxDQUFDOztBQTNDVyx1QkFBdUI7SUFTakMsV0FBQSxZQUFZLENBQUE7R0FURix1QkFBdUIsQ0E0Q25DIn0=