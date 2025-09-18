import { Constants, ModelType } from "../../../common/constants";
import * as path from "path";
import { Node } from "../../interface/node";

export class EsColumnNode extends Node {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/b_props.png");
    public contextValue: string = ModelType.ES_COLUMN;
    private type:string;
    constructor(name: string, property: any, readonly parent: Node) {
        super(name)
        this.description=property.type
        this.type=property.type;
        this.init(parent)
    }
}
