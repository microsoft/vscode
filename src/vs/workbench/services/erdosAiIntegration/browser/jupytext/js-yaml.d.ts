declare module 'js-yaml' {
    export function load(str: string, options?: any): any;
    export function dump(obj: any, options?: any): string;
}

