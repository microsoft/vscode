import { EsRequest } from "../../model/es/esRequest";
import { AbstractPageSerivce } from "./pageService";

export class EsPageService extends AbstractPageSerivce {

    protected buildPageSql(sql: string, start: number, limit: number): string {
        return EsRequest.build(sql, body => {
            body.from = start;
            body.size = limit;
        })
    }
    
}