import { ModelType } from "../../common/constants";
import { ThemeIcon, TreeItemCollapsibleState } from "vscode";
import { Node } from "../interface/node";

export class LinkNode extends Node {
    contextValue = ModelType.Link;
    constructor(info: string) {
        super(info)
        this.iconPath=new ThemeIcon("link")
        this.collapsibleState = TreeItemCollapsibleState.None
    }
    getChildren(): Promise<Node[]> {
        return null;
    }
}