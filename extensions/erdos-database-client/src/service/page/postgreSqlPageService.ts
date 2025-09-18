import { AbstractPageSerivce } from "./pageService";

export class PostgreSqlPageService extends AbstractPageSerivce{
    protected buildPageSql(sql: string, start: number, limit: number): string {
        const paginationSql = `LIMIT ${limit} OFFSET ${start}`;
        if (sql.match(/\blimit\b/i)) {
            return sql.replace(/\blimit\b.+/ig, paginationSql)
        }

        return `${sql} ${paginationSql}`
    }

}