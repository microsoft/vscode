import { ModelType } from "../../../common/constants";
import { Node } from "../../../model/interface/node";
import { CompletionItem, CompletionItemKind, SnippetString } from "vscode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";
import { NodeFinder } from "../nodeFinder";

export abstract class BaseChain implements ComplectionChain {
    protected needStop: boolean = false;
    // TODO 1: Separate aggregate functions 2: Add custom functions to suggestions
    protected functionList: CompletionItem[] = this.strToComplection(["CHAR_LENGTH", "CONCAT", "NOW", "DATE_ADD", "DATE_SUB", "MAX", "COUNT", "MIN", "SUM", "AVG", "LENGTH", "IF", "IFNULL", "MD5", "SHA", "CURRENT_DATE", "DATE_FORMAT", "CAST", "TRIM", "LAST_INSERT_ID", "MOD"], CompletionItemKind.Function, '($1)');
    abstract getComplection(context: ComplectionContext): CompletionItem[] | Promise<CompletionItem[]>;
    stop(): boolean {
        return this.needStop;
    }
    protected requestStop() {
        this.needStop = true;
    }
    protected strToComplection(complections: string[], kind: CompletionItemKind = CompletionItemKind.Keyword, span = ''): CompletionItem[] {
        return complections.map(item => {
            const completionItem = new CompletionItem(item + ' ');
            completionItem.insertText = new SnippetString(item + span);
            completionItem.kind = kind;
            return completionItem;
        })
    }
    protected async findNodes(schema: string, table: string, kind: CompletionItemKind, ...types: ModelType[]): Promise<CompletionItem[]> {
        const nodes = await NodeFinder.findNodes(schema, table, ...types)
        return this.nodeToComplection(nodes, kind)
    }
    protected nodeToComplection(nodes: Node[], kind: CompletionItemKind, span = ''): CompletionItem[] {
        return nodes.map(item => {
            const completionItem = new CompletionItem(item.label + ' ');
            completionItem.insertText = new SnippetString(item + span);
            completionItem.kind = kind;
            completionItem.insertText = item.wrap(item.label);
            return completionItem;
        })
    }
}