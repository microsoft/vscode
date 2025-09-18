import { AbstractPageSerivce } from "./pageService";

export class MysqlPageSerivce extends AbstractPageSerivce {

    protected buildPageSql(sql: string, start: number, limit: number): string {

        const paginationSql = `LIMIT ${start},${limit}`;
        if (sql.match(/\blimit\b/i)) {
            return sql.replace(/\blimit\b.+/ig, paginationSql)
        }

        return `${sql} ${paginationSql}`

    }

}