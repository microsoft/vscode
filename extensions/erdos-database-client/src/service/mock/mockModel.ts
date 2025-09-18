export interface MockModel {
    schema: string;
    mockValueReference: string;
    table: string;
    mockStartIndex: number|string;
    mockCount: number;
    mock: {
        [key: string]: {
            type: string,
            value: any,
        }
    }
}