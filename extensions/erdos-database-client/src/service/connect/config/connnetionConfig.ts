import { Node } from "../../../model/interface/node";

export class ConnnetionConfig {
    database: ConnectionTarget;
    nosql: ConnectionTarget;
}

export class ConnectionTarget {
    global: { [key: string]: Node };
    workspace: { [key: string]: Node };
}