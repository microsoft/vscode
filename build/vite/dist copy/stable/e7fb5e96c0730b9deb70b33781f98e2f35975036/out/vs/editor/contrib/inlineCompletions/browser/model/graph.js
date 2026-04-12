/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class DirectedGraph {
    constructor() {
        this._nodes = new Set();
        this._outgoingEdges = new Map();
    }
    static from(nodes, getOutgoing) {
        const graph = new DirectedGraph();
        for (const node of nodes) {
            graph._nodes.add(node);
        }
        for (const node of nodes) {
            const outgoing = getOutgoing(node);
            if (outgoing.length > 0) {
                const outgoingSet = new Set();
                for (const target of outgoing) {
                    outgoingSet.add(target);
                }
                graph._outgoingEdges.set(node, outgoingSet);
            }
        }
        return graph;
    }
    /**
     * After this, the graph is guaranteed to have no cycles.
     */
    removeCycles() {
        const foundCycles = [];
        const visited = new Set();
        const recursionStack = new Set();
        const toRemove = [];
        const dfs = (node) => {
            visited.add(node);
            recursionStack.add(node);
            const outgoing = this._outgoingEdges.get(node);
            if (outgoing) {
                for (const neighbor of outgoing) {
                    if (!visited.has(neighbor)) {
                        dfs(neighbor);
                    }
                    else if (recursionStack.has(neighbor)) {
                        // Found a cycle
                        foundCycles.push(neighbor);
                        toRemove.push({ from: node, to: neighbor });
                    }
                }
            }
            recursionStack.delete(node);
        };
        // Run DFS from all unvisited nodes
        for (const node of this._nodes) {
            if (!visited.has(node)) {
                dfs(node);
            }
        }
        // Remove edges that cause cycles
        for (const { from, to } of toRemove) {
            const outgoingSet = this._outgoingEdges.get(from);
            if (outgoingSet) {
                outgoingSet.delete(to);
            }
        }
        return { foundCycles };
    }
    getOutgoing(node) {
        const outgoing = this._outgoingEdges.get(node);
        return outgoing ? Array.from(outgoing) : [];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JhcGguanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL21vZGVsL2dyYXBoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE1BQU0sT0FBTyxhQUFhO0lBQTFCO1FBQ2tCLFdBQU0sR0FBRyxJQUFJLEdBQUcsRUFBSyxDQUFDO1FBQ3RCLG1CQUFjLEdBQUcsSUFBSSxHQUFHLEVBQWEsQ0FBQztJQTBFeEQsQ0FBQztJQXhFTyxNQUFNLENBQUMsSUFBSSxDQUFJLEtBQW1CLEVBQUUsV0FBc0M7UUFDaEYsTUFBTSxLQUFLLEdBQUcsSUFBSSxhQUFhLEVBQUssQ0FBQztRQUVyQyxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQzFCLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3hCLENBQUM7UUFFRCxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQzFCLE1BQU0sUUFBUSxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3pCLE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxFQUFLLENBQUM7Z0JBQ2pDLEtBQUssTUFBTSxNQUFNLElBQUksUUFBUSxFQUFFLENBQUM7b0JBQy9CLFdBQVcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3pCLENBQUM7Z0JBQ0QsS0FBSyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQzdDLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxZQUFZO1FBQ1gsTUFBTSxXQUFXLEdBQVEsRUFBRSxDQUFDO1FBQzVCLE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxFQUFLLENBQUM7UUFDN0IsTUFBTSxjQUFjLEdBQUcsSUFBSSxHQUFHLEVBQUssQ0FBQztRQUNwQyxNQUFNLFFBQVEsR0FBOEIsRUFBRSxDQUFDO1FBRS9DLE1BQU0sR0FBRyxHQUFHLENBQUMsSUFBTyxFQUFRLEVBQUU7WUFDN0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNsQixjQUFjLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRXpCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQy9DLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQ2QsS0FBSyxNQUFNLFFBQVEsSUFBSSxRQUFRLEVBQUUsQ0FBQztvQkFDakMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQzt3QkFDNUIsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUNmLENBQUM7eUJBQU0sSUFBSSxjQUFjLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7d0JBQ3pDLGdCQUFnQjt3QkFDaEIsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDM0IsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7b0JBQzdDLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7WUFFRCxjQUFjLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzdCLENBQUMsQ0FBQztRQUVGLG1DQUFtQztRQUNuQyxLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNoQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUN4QixHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDWCxDQUFDO1FBQ0YsQ0FBQztRQUVELGlDQUFpQztRQUNqQyxLQUFLLE1BQU0sRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLElBQUksUUFBUSxFQUFFLENBQUM7WUFDckMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEQsSUFBSSxXQUFXLEVBQUUsQ0FBQztnQkFDakIsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN4QixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sRUFBRSxXQUFXLEVBQUUsQ0FBQztJQUN4QixDQUFDO0lBRUQsV0FBVyxDQUFDLElBQU87UUFDbEIsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0MsT0FBTyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUM3QyxDQUFDO0NBQ0QifQ==