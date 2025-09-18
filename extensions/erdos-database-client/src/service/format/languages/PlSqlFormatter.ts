import Formatter from "../core/Formatter";
import Tokenizer from "../core/Tokenizer";

interface FormatterConfig {
    indent?: string;
    params?: Record<string, unknown>;
}

const reservedWords = [
    "A", "ACCESSIBLE", "AGENT", "AGGREGATE", "ALL", "ALTER", "ANY", "ARRAY", "AS", "ASC", "AT", "ATTRIBUTE", "AUTHID", "AVG",
    "BETWEEN", "BFILE_BASE", "BINARY_INTEGER", "BINARY", "BLOB_BASE", "BLOCK", "BODY", "BOOLEAN", "BOTH", "BOUND",
    "BULK", "BY", "BYTE",
    "C", "CALL", "CALLING", "CASCADE", "CASE", "CHAR_BASE", "CHAR", "CHARACTER", "CHARSET", "CHARSETFORM", "CHARSETID",
    "CHECK", "CLOB_BASE", "CLONE", "CLOSE", "CLUSTER", "CLUSTERS", "COALESCE", "COLAUTH", "COLLECT", "COLUMNS", "COMMENT",
    "COMMIT", "COMMITTED", "COMPILED", "COMPRESS", "CONNECT", "CONSTANT", "CONSTRUCTOR", "CONTEXT", "CONTINUE", "CONVERT",
    "COUNT", "CRASH", "CREATE", "CREDENTIAL", "CURRENT", "CURRVAL", "CURSOR", "CUSTOMDATUM",
    "DANGLING", "DATA", "DATE_BASE", "DATE", "DAY", "DECIMAL", "DEFAULT", "DEFINE", "DELETE", "DESC",
    "DETERMINISTIC", "DIRECTORY", "DISTINCT", "DO", "DOUBLE", "DROP", "DURATION",
    "ELEMENT", "ELSIF", "EMPTY", "ESCAPE", "EXCEPTIONS", "EXCLUSIVE", "EXECUTE", "EXISTS",
    "EXIT", "EXTENDS", "EXTERNAL", "EXTRACT",
    "FALSE", "FETCH", "FINAL", "FIRST", "FIXED", "FLOAT", "FOR", "FORALL", "FORCE", "FROM", "FUNCTION",
    "GENERAL", "GOTO", "GRANT", "GROUP", "HASH", "HEAP", "HIDDEN", "HOUR",
    "IDENTIFIED", "IF", "IMMEDIATE", "IN", "INCLUDING", "INDEX", "INDEXES", "INDICATOR", "INDICES", "INFINITE",
    "INSTANTIABLE", "INT", "INTEGER", "INTERFACE", "INTERVAL", "INTO", "INVALIDATE", "IS", "ISOLATION",
    "JAVA",
    "LANGUAGE", "LARGE", "LEADING", "LENGTH", "LEVEL", "LIBRARY", "LIKE", "LIKE2", "LIKE4", "LIKEC", "LIMITED", "LOCAL",
    "LOCK", "LONG",
    "MAP", "MAX", "MAXLEN", "MEMBER", "MERGE", "MIN", "MINUS", "MINUTE", "MLSLABEL", "MOD", "MODE", "MONTH", "MULTISET",
    "NAME", "NAN", "NATIONAL", "NATIVE", "NATURAL", "NATURALN", "NCHAR", "NEW", "NEXTVAL", "NOCOMPRESS", "NOCOPY", "NOT",
    "NOWAIT", "NULL", "NULLIF", "NUMBER_BASE", "NUMBER",
    "OBJECT", "OCICOLL", "OCIDATE", "OCIDATETIME", "OCIDURATION", "OCIINTERVAL", "OCILOBLOCATOR", "OCINUMBER", "OCIRAW",
    "OCIREF", "OCIREFCURSOR", "OCIROWID", "OCISTRING", "OCITYPE", "OF", "OLD", "ON", "ONLY", "OPAQUE", "OPEN", "OPERATOR",
    "OPTION", "ORACLE", "ORADATA", "ORDER", "ORGANIZATION", "ORLANY", "ORLVARY", "OTHERS", "OUT", "OVERLAPS",
    "OVERRIDING",
    "PACKAGE", "PARALLEL_ENABLE", "PARAMETER", "PARAMETERS", "PARENT", "PARTITION", "PASCAL", "PCTFREE", "PIPE", "PIPELINED",
    "PLS_INTEGER", "PLUGGABLE", "POSITIVE", "POSITIVEN", "PRAGMA", "PRECISION", "PRIOR", "PRIVATE", "PROCEDURE", "PUBLIC",
    "RAISE", "RANGE", "RAW", "READ", "REAL", "RECORD", "REF", "REFERENCE", "RELEASE", "RELIES_ON", "REM", "REMAINDER",
    "RENAME", "RESOURCE", "RESULT_CACHE", "RESULT", "RETURN", "RETURNING", "REVERSE", "REVOKE", "ROLLBACK", "ROW", "ROWID",
    "ROWNUM", "ROWTYPE",
    "SAMPLE", "SAVE", "SAVEPOINT", "SB1", "SB2", "SB4", "SECOND", "SEGMENT", "SELF", "SEPARATE", "SEQUENCE",
    "SERIALIZABLE", "SHARE", "SHORT", "SIZE_T", "SIZE", "SMALLINT", "SOME", "SPACE", "SPARSE", "SQL", "SQLCODE",
    "SQLDATA", "SQLERRM", "SQLNAME", "SQLSTATE", "STANDARD", "START", "STATIC", "STDDEV", "STORED", "STRING", "STRUCT",
    "STYLE", "SUBMULTISET", "SUBPARTITION", "SUBSTITUTABLE", "SUBTYPE", "SUCCESSFUL", "SUM", "SYNONYM", "SYSDATE",
    "TABAUTH", "TABLE", "TDO", "THE", "THEN", "TIME", "TIMESTAMP", "TIMEZONE_ABBR", "TIMEZONE_HOUR", "TIMEZONE_MINUTE",
    "TIMEZONE_REGION", "TO", "TRAILING", "TRANSACTION", "TRANSACTIONAL", "TRIGGER", "TRUE", "TRUSTED", "TYPE",
    "UB1", "UB2", "UB4", "UID", "UNDER", "UNIQUE", "UNPLUG", "UNSIGNED", "UNTRUSTED", "USE", "USER", "USING",
    "VALIDATE", "VALIST", "VALUE", "VARCHAR", "VARCHAR2", "VARIABLE", "VARIANCE", "VARRAY", "VARYING", "VIEW", "VIEWS", "VOID",
    "WHENEVER", "WHILE", "WITH", "WORK", "WRAPPED", "WRITE",
    "YEAR",
    "ZONE",
];

const reservedToplevelWords = [
    "ADD", "ALTER COLUMN", "ALTER TABLE",
    "BEGIN",
    "CONNECT BY",
    "DECLARE", "DELETE FROM", "DELETE",
    "END", "EXCEPT", "EXCEPTION",
    "FETCH FIRST", "FROM",
    "GROUP BY",
    "HAVING",
    "INSERT INTO", "INSERT", "INTERSECT",
    "LIMIT", "LOOP",
    "MODIFY",
    "ORDER BY",
    "SELECT", "SET CURRENT SCHEMA", "SET SCHEMA", "SET", "START WITH",
    "UNION ALL", "UNION", "UPDATE",
    "VALUES",
    "WHERE"
];

const reservedNewlineWords = [
    "AND",
    "CROSS APPLY", "CROSS JOIN",
    "ELSE", "END",
    "INNER JOIN",
    "JOIN",
    "LEFT JOIN", "LEFT OUTER JOIN",
    "OR", "OUTER APPLY", "OUTER JOIN",
    "RIGHT JOIN", "RIGHT OUTER JOIN",
    "WHEN",
    "XOR"
];

let tokenizer;

export default class PlSqlFormatter {
    private cfg: FormatterConfig;

    /**
     * @param {Object} cfg Different set of configurations
     */
    constructor(cfg: FormatterConfig = {}) {
        this.cfg = cfg;
    }

    /**
     * Format the whitespace in a PL/SQL string to make it easier to read
     *
     * @param {String} query The PL/SQL string
     * @return {String} formatted string
     */
    format(query) {
        if (!tokenizer) {
            tokenizer = new Tokenizer({
                reservedWords,
                reservedToplevelWords,
                reservedNewlineWords,
                stringTypes: [`""`, "N''", "''", "``"],
                openParens: ["(", "CASE"],
                closeParens: [")", "END"],
                indexedPlaceholderTypes: ["?"],
                namedPlaceholderTypes: [":"],
                lineCommentTypes: ["--"],
                specialWordChars: ["_", "$", "#", ".", "@"]
            });
        }
        return new Formatter(this.cfg, tokenizer).format(query);
    }
}


