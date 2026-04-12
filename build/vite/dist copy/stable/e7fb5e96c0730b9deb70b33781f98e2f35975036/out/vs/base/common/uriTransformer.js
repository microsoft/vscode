/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URITransformer } from './uriIpc.js';
/**
 * ```
 * --------------------------------
 * |    UI SIDE    |  AGENT SIDE  |
 * |---------------|--------------|
 * | vscode-remote | file         |
 * | file          | vscode-local |
 * --------------------------------
 * ```
 */
function createRawURITransformer(remoteAuthority) {
    return {
        transformIncoming: (uri) => {
            if (uri.scheme === 'vscode-remote') {
                return { scheme: 'file', path: uri.path, query: uri.query, fragment: uri.fragment };
            }
            if (uri.scheme === 'file') {
                return { scheme: 'vscode-local', path: uri.path, query: uri.query, fragment: uri.fragment };
            }
            return uri;
        },
        transformOutgoing: (uri) => {
            if (uri.scheme === 'file') {
                return { scheme: 'vscode-remote', authority: remoteAuthority, path: uri.path, query: uri.query, fragment: uri.fragment };
            }
            if (uri.scheme === 'vscode-local') {
                return { scheme: 'file', path: uri.path, query: uri.query, fragment: uri.fragment };
            }
            return uri;
        },
        transformOutgoingScheme: (scheme) => {
            if (scheme === 'file') {
                return 'vscode-remote';
            }
            else if (scheme === 'vscode-local') {
                return 'file';
            }
            return scheme;
        }
    };
}
export function createURITransformer(remoteAuthority) {
    return new URITransformer(createRawURITransformer(remoteAuthority));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJpVHJhbnNmb3JtZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi91cmlUcmFuc2Zvcm1lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQWdDLGNBQWMsRUFBbUIsTUFBTSxhQUFhLENBQUM7QUFFNUY7Ozs7Ozs7OztHQVNHO0FBQ0gsU0FBUyx1QkFBdUIsQ0FBQyxlQUF1QjtJQUN2RCxPQUFPO1FBQ04saUJBQWlCLEVBQUUsQ0FBQyxHQUFhLEVBQVksRUFBRTtZQUM5QyxJQUFJLEdBQUcsQ0FBQyxNQUFNLEtBQUssZUFBZSxFQUFFLENBQUM7Z0JBQ3BDLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDckYsQ0FBQztZQUNELElBQUksR0FBRyxDQUFDLE1BQU0sS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDM0IsT0FBTyxFQUFFLE1BQU0sRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUM3RixDQUFDO1lBQ0QsT0FBTyxHQUFHLENBQUM7UUFDWixDQUFDO1FBQ0QsaUJBQWlCLEVBQUUsQ0FBQyxHQUFhLEVBQVksRUFBRTtZQUM5QyxJQUFJLEdBQUcsQ0FBQyxNQUFNLEtBQUssTUFBTSxFQUFFLENBQUM7Z0JBQzNCLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUMxSCxDQUFDO1lBQ0QsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLGNBQWMsRUFBRSxDQUFDO2dCQUNuQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3JGLENBQUM7WUFDRCxPQUFPLEdBQUcsQ0FBQztRQUNaLENBQUM7UUFDRCx1QkFBdUIsRUFBRSxDQUFDLE1BQWMsRUFBVSxFQUFFO1lBQ25ELElBQUksTUFBTSxLQUFLLE1BQU0sRUFBRSxDQUFDO2dCQUN2QixPQUFPLGVBQWUsQ0FBQztZQUN4QixDQUFDO2lCQUFNLElBQUksTUFBTSxLQUFLLGNBQWMsRUFBRSxDQUFDO2dCQUN0QyxPQUFPLE1BQU0sQ0FBQztZQUNmLENBQUM7WUFDRCxPQUFPLE1BQU0sQ0FBQztRQUNmLENBQUM7S0FDRCxDQUFDO0FBQ0gsQ0FBQztBQUVELE1BQU0sVUFBVSxvQkFBb0IsQ0FBQyxlQUF1QjtJQUMzRCxPQUFPLElBQUksY0FBYyxDQUFDLHVCQUF1QixDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7QUFDckUsQ0FBQyJ9