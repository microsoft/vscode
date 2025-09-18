import { ConnectionNode } from "../../model/database/connectionNode";

export interface StatusService {
    show(connectionNode: ConnectionNode): void | Promise<void>;
}