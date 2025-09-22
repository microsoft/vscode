import { Node } from "../../../model/interface/node";

export class ConnectionConfig {
    connections: ConnectionTarget;
}

export class ConnectionTarget {
    global: { [key: string]: Node };
    workspace: { [key: string]: Node };
}