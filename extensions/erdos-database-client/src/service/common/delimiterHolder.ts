export class DelimiterHolder {

    private static delimiterPattern = /\bdelimiter\b\s*(\S+)/ig;
    private static delimiteMap = new Map<string, string>();

    public static get(key: string) {
        const delimiter = this.delimiteMap.get(key);
        if (!delimiter) { return ";" }
        return delimiter
    }


    public static parseBatch(sql: string, key?: string): { sql: string, replace: boolean } {
        let replace = false;
        if (!sql) { return { sql, replace }; }

        const delimiterArray = []
        let delimiter = this.delimiteMap.get(key)
        if (delimiter) {
            delimiterArray.push(delimiter)
        }else{
            delimiter=";"
        }

        let delimiterMatch: RegExpExecArray
        while ((delimiterMatch = this.delimiterPattern.exec(sql)) != null) {
            const target = delimiterMatch[1].replace(new RegExp(`${delimiter}\\s*$`, 'gm'), "").split("").map((c) => c.match(/\w/) ? c : "\\" + c).join("")
            delimiterArray.push(target)
            if (key) {
                this.delimiteMap.set(key, target)
            }
        }

        if (delimiterArray.length > 0) {
            sql = sql.replace(this.delimiterPattern, "")
            for (const delimiter of delimiterArray) {
                sql = this.buildDelimiter(sql, delimiter)
                replace = true;
            }
        }

        return { sql, replace };
    }

    private static buildDelimiter(sql: string, delimiter: string) {
        if (!sql || !delimiter) { return sql; }
        return sql.replace(new RegExp(`${delimiter}\\s*$`, 'gm'), ";")
    }

}