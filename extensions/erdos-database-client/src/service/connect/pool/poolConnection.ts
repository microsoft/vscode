
export enum pcStatus {
    PEENDING="PEENDING", FREE="FREE", BUSY="BUSY"
}

export class IpoolConnection<T>  {
    public actual?: T;
    constructor(public id: number, public status: pcStatus) {

    }
}