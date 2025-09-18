import { AbstractPageSerivce } from "./pageService";

export class MssqlPageService extends AbstractPageSerivce{
    protected buildPageSql(sql: string, start: number, limit: number): string {
        throw new Error("Method not implemented.");
    }

}