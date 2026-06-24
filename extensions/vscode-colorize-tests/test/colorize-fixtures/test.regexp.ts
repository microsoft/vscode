const a = /\\\xFF/;
const b = /[.*+\-?^${}()|[\]\\]/;
const c = /\r\n|\r|\n/;
const d = /\/\/# sourceMappingURL=[^ ]+$/;
const e = /<%=\s*([^\s]+)\s*%>/;
const f = /```suggestion(\u0020*(\r\n|\n))((?<suggestion>[\s\S]*?)(\r\n|\n))?```/;
const g =  /(?<=^|\s)(?=[a-z])([a-z])(?=.*\1$)\(([^()]*0+)(?<!password|token)\)(?!.*?(password|token))\p{L}(?:(?<=\(\d{3}\))-\1|-\1)(?!\s)/u;
