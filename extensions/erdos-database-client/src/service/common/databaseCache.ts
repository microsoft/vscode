import { GlobalState, WorkState } from "../../common/state";
import { ExtensionContext, TreeItemCollapsibleState } from "vscode";
import { CacheKey, ModelType } from "../../common/constants";
import { SchemaNode } from "../../model/database/schemaNode";
import { Node } from "../../model/interface/node";

export class DatabaseCache {

    private static cache = { database: {} };
    private static childCache = {};
    private static globalCollpaseState: { key?: TreeItemCollapsibleState };
    private static workspaceCollpaseState: { key?: TreeItemCollapsibleState };

    /**
     * get element current collapseState or default collapseState
     * @param element 
     */
    public static getElementState(element?: Node) {

        const contextValue = element.contextValue;
        if (!contextValue || contextValue == ModelType.COLUMN || contextValue == ModelType.INFO || contextValue == ModelType.FUNCTION
            || contextValue == ModelType.TRIGGER || contextValue == ModelType.PROCEDURE || contextValue == ModelType.USER
            || contextValue == ModelType.DIAGRAM || contextValue == ModelType.ES_COLUMN || contextValue == ModelType.COLUMN
        ) {
            return TreeItemCollapsibleState.None;
        }

        const collpaseState = element.global === false ? this.workspaceCollpaseState : this.globalCollpaseState;

        const cacheKey = element.getCacheKey();
        if (cacheKey && collpaseState[cacheKey]) {
            return collpaseState[cacheKey];
        } else if (contextValue == ModelType.CONNECTION || contextValue == ModelType.TABLE_GROUP) {
            return TreeItemCollapsibleState.Expanded;
        } else {
            return TreeItemCollapsibleState.Collapsed;
        }

    }


    /**
     * update tree node collapseState
     * @param element 
     * @param collapseState 
     */
    public static storeElementState(element?: Node, collapseState?: TreeItemCollapsibleState) {

        if (element.contextValue == ModelType.COLUMN || element.contextValue == ModelType.INFO) {
            return;
        }

        const cacheKey = element.getCacheKey();
        if (element.global === false) {
            this.workspaceCollpaseState[cacheKey] = collapseState;
            WorkState.update(CacheKey.COLLAPSE_STATE, this.workspaceCollpaseState);
        } else {
            this.globalCollpaseState[cacheKey] = collapseState;
            GlobalState.update(CacheKey.COLLAPSE_STATE, this.globalCollpaseState);
        }

    }

    /**
     * cache init, Mainly initializing context object
     */
    public static initCache() {
        this.globalCollpaseState = GlobalState.get(CacheKey.COLLAPSE_STATE, {});
        this.workspaceCollpaseState = WorkState.get(CacheKey.COLLAPSE_STATE, {});
    }

    public static clearCache() {
        this.childCache = {}
        this.cache.database = {}
    }


    public static setChildCache(uid: string, tableNodeList: Node[]) {
        this.childCache[uid] = tableNodeList;
    }

    public static getChildCache<T extends Node>(uid: string): T[] {
        return this.childCache[uid];
    }

    /**
     * clear database data for connection
     * @param connectionid 
     */
    public static clearDatabaseCache(connectionid: string) {
        if (connectionid) {
            delete this.cache.database[connectionid];
        }
    }

    /**
     * support to complection manager
     */
    public static getDatabaseNodeList(): SchemaNode[] {
        let databaseNodeList = [];

        Object.keys(this.cache.database).forEach((key) => {
            const tempList = this.cache.database[key];
            if (tempList) {
                databaseNodeList = databaseNodeList.concat(tempList);
            }
        });

        return databaseNodeList;
    }

    public static setSchemaListOfConnection(connectionid: string, DatabaseNodeList: Node[]) {
        this.cache.database[connectionid] = DatabaseNodeList;
    }

    public static getSchemaListOfConnection(connectcionid: string): SchemaNode[] {
        if (this.cache.database[connectcionid]) {
            return this.cache.database[connectcionid];
        } else {
            return null;
        }
    }



}
