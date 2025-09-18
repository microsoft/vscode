
export class EsRequest {

    constructor(public type: string, public path: string, public body: string) { }

    public static build(request: string, callback: (body: EsQuery) => void): string {
        const esReq = this.parse(request)
        const obj = JSON.parse(esReq.body)
        callback(obj)
        return `${esReq.type} ${esReq.path}\n${JSON.stringify(obj)}`
    }

    public static parse(request: string): EsRequest {

        const splitIndex = request.indexOf('\n')
        let [type, path] = (splitIndex == -1 ? request : request.substring(0, splitIndex)).split(' ')
        if (path && path.charAt(0) != "/") {
            path = "/" + path
        }
        const body = splitIndex == -1 ? null : request.substring(splitIndex + 1) + "\n"

        return new EsRequest(type, path, body)
    }

}

export interface EsQuery {
    from?: number;
    size?: number;
    query?: any;
    sort?: any[];
    stored_fields?: any;
    highlight?: any;
}