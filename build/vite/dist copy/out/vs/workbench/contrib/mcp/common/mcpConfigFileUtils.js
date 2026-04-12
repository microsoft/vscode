/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { findNodeAtLocation, parseTree as jsonParseTree } from '../../../../base/common/json.js';
export const getMcpServerMapping = (opts) => {
    const tree = jsonParseTree(opts.model.getValue());
    const servers = findNodeAtLocation(tree, opts.pathToServers);
    if (!servers || servers.type !== 'object') {
        return new Map();
    }
    const result = new Map();
    for (const node of servers.children || []) {
        if (node.type !== 'property' || node.children?.[0]?.type !== 'string') {
            continue;
        }
        const start = opts.model.getPositionAt(node.offset);
        const end = opts.model.getPositionAt(node.offset + node.length);
        result.set(node.children[0].value, {
            uri: opts.model.uri,
            range: {
                startLineNumber: start.lineNumber,
                startColumn: start.column,
                endLineNumber: end.lineNumber,
                endColumn: end.column,
            }
        });
    }
    return result;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwQ29uZmlnRmlsZVV0aWxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL2NvbW1vbi9tY3BDb25maWdGaWxlVXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLFNBQVMsSUFBSSxhQUFhLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUlqRyxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLElBSW5DLEVBQXlCLEVBQUU7SUFDM0IsTUFBTSxJQUFJLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUNsRCxNQUFNLE9BQU8sR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQzdELElBQUksQ0FBQyxPQUFPLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUMzQyxPQUFPLElBQUksR0FBRyxFQUFFLENBQUM7SUFDbEIsQ0FBQztJQUVELE1BQU0sTUFBTSxHQUFHLElBQUksR0FBRyxFQUFvQixDQUFDO0lBQzNDLEtBQUssTUFBTSxJQUFJLElBQUksT0FBTyxDQUFDLFFBQVEsSUFBSSxFQUFFLEVBQUUsQ0FBQztRQUMzQyxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssVUFBVSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDdkUsU0FBUztRQUNWLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDaEUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRTtZQUNsQyxHQUFHLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHO1lBQ25CLEtBQUssRUFBRTtnQkFDTixlQUFlLEVBQUUsS0FBSyxDQUFDLFVBQVU7Z0JBQ2pDLFdBQVcsRUFBRSxLQUFLLENBQUMsTUFBTTtnQkFDekIsYUFBYSxFQUFFLEdBQUcsQ0FBQyxVQUFVO2dCQUM3QixTQUFTLEVBQUUsR0FBRyxDQUFDLE1BQU07YUFDckI7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDLENBQUMifQ==