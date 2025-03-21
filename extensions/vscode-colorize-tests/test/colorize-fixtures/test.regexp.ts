const a = /\\\xFF/;
const b = /[.*+\-?^${}()|[\]\\]/;
const c = /\r\n|\r|\n/;
const d = /\/\/# sourceMappingURL=[^ ]+$/;
const e = /<%=\s*([^\s]+)\s*%>/;
const f = /```suggestion(\u0020*(\r\n|\n))((?<suggestion>[\s\S]*?)(\r\n|\n))?```/;
