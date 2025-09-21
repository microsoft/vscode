import { ModelType } from "../../common/constants";
import { ConnectionNode } from "../../model/database/connectionNode";
import { UserGroup } from "../../model/database/userGroup";
import { Node } from "../../model/interface/node";
import { FunctionGroup } from "../../model/main/functionGroup";
import { ProcedureGroup } from "../../model/main/procedureGroup";
import { TableGroup } from "../../model/main/tableGroup";
import { TriggerGroup } from "../../model/main/triggerGroup";
import { ViewGroup } from "../../model/main/viewGroup";
import { ConnectionManager } from "../../service/connectionManager";

export class NodeFinder {

    public static async findNodes(schema: string, table: string, ...types: ModelType[]): Promise<Node[]> {

        let lcp = ConnectionManager.tryGetConnection();
        if (!lcp) return [];

        if (schema) {
            const connectcionid = lcp && lcp.getConnectId({ schema: schema, withSchema: true });
            lcp = Node.nodeCache[connectcionid]
            if (!lcp) return []
        }

        let nodeList = []
        
        console.log(`[NodeFinder] Finding nodes for types: ${types.join(', ')}, lcp: ${lcp?.constructor?.name}, table: ${table}`);
        const groupNodes = await lcp.getChildren();
        console.log(`[NodeFinder] Got ${groupNodes?.length || 0} group nodes: ${groupNodes?.map(n => n.constructor.name).join(', ') || 'none'}`);
        for (const type of types) {
            switch (type) {
                case ModelType.COLUMN:
                    const regionNode = lcp.getByRegion(table);
                    if (regionNode) {
                        nodeList.push(...(await regionNode.getChildren()))
                    }
                    break;
                case ModelType.SCHEMA:
                    if (!lcp || !lcp.parent || !lcp.parent.getChildren) { break; }
                    const databaseNodes = await lcp.parent.getChildren()
                    nodeList.push(...databaseNodes.filter(databaseNodes => !(databaseNodes instanceof UserGroup)))
                    break;
                case ModelType.TABLE:
                    if(lcp instanceof ConnectionNode) break;
                    const tableGroup = groupNodes.find(n => n instanceof TableGroup);
                    console.log(`[NodeFinder] TABLE: tableGroup = ${tableGroup?.constructor?.name || 'undefined'}`);
                    if (tableGroup) {
                        nodeList.push(...await tableGroup.getChildren())
                    }
                    break;
                case ModelType.VIEW:
                    if(lcp instanceof ConnectionNode) break;
                    const viewGroup = groupNodes.find(n => n instanceof ViewGroup);
                    console.log(`[NodeFinder] VIEW: viewGroup = ${viewGroup?.constructor?.name || 'undefined'}`);
                    if (viewGroup) {
                        nodeList.push(...await viewGroup.getChildren())
                    }
                    break;
                case ModelType.PROCEDURE:
                    if(lcp instanceof ConnectionNode) break;
                    const procedureGroup = groupNodes.find(n => n instanceof ProcedureGroup);
                    console.log(`[NodeFinder] PROCEDURE: procedureGroup = ${procedureGroup?.constructor?.name || 'undefined'}`);
                    if (procedureGroup) {
                        nodeList.push(...await procedureGroup.getChildren())
                    }
                    break;
                case ModelType.TRIGGER:
                    if(lcp instanceof ConnectionNode) break;
                    const triggerGroup = groupNodes.find(n => n instanceof TriggerGroup);
                    console.log(`[NodeFinder] TRIGGER: triggerGroup = ${triggerGroup?.constructor?.name || 'undefined'}`);
                    if (triggerGroup) {
                        nodeList.push(...await triggerGroup.getChildren())
                    }
                    break;
                case ModelType.FUNCTION:
                    if(lcp instanceof ConnectionNode) break;
                    const functionGroup = groupNodes.find(n => n instanceof FunctionGroup);
                    console.log(`[NodeFinder] FUNCTION: functionGroup = ${functionGroup?.constructor?.name || 'undefined'}`);
                    if (functionGroup) {
                        nodeList.push(...await functionGroup.getChildren())
                    }
                    break;
            }
        }
        console.log(`[NodeFinder] Found ${nodeList.length} total nodes`);
        return nodeList;
    }

}