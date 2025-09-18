import { ModelType } from "../../common/constants";
import { Node } from "../interface/node";

export class InfoNode extends Node {
    public iconPath: string = "";
    public contextValue: string = ModelType.INFO;
    constructor(label: string | Error) {
        super(typeof label === 'string' ? label : label.message)
    }

    public async getChildren(): Promise<Node[]> {
        return [];
    }
}
