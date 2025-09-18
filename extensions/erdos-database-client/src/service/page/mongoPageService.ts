import { AbstractPageSerivce } from "./pageService";

export class MongoPageService extends AbstractPageSerivce{
    protected buildPageSql(sql: string, start: number, limit: number): string {
        if (sql.match(/\.skip.+?\)/i)) {
            return sql.replace(/\.skip.+?\)/i, `.skip(${start})`)
        }
        return sql.replace(/(\.find.+?\))/,`$1.skip(${start})`);
    }

    protected pageMatch() {
        return /limit\((\d+)\)/i;
    }

}