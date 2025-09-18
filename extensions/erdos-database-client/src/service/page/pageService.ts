import { ConfigKey } from "../../common/constants";
import { Global } from "../../common/global";

export interface PageService {
    /**
     * build page sql
     * @param sql 
     * @param page 
     * @param pageSize 
     * @return paginationSql
     */
    build(sql: string, page: number, pageSize: number): string;

    getPageSize(sql: string): number;

}

export abstract class AbstractPageSerivce implements PageService {

    public build(sql: string, page: number, pageSize: number): string {

        if (!sql) {
            throw new Error("Not support empty sql!");
        }

        if (!pageSize) {
            pageSize = 100;
        }

        let start = 0;
        if (page) {
            start = (page - 1) * pageSize;
        }

        return this.buildPageSql(sql, start, pageSize)
    }

    public getPageSize(sql: string): number {

        const limitBlock = sql.match(this.pageMatch())
        if (limitBlock) {
            return parseInt(limitBlock[1])
        }

        return Global.getConfig(ConfigKey.DEFAULT_LIMIT);
    }

    protected pageMatch() {
        return /limit\s*(\d+)/i;
    }

    protected abstract buildPageSql(sql: string, start: number, limit: number): string;

}