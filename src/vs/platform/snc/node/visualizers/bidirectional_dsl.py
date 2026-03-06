
from dataclasses import dataclass
from typing import Any, Callable, Iterator, cast
import re
import ast
from ast import Module, Expr, JoinedStr, Constant, FormattedValue

SUBPARSERS = re.compile(r'\{(\w+)?:(\w+)\}')

def compile(templ_str) -> list[str | tuple[str|None, str]]:
    parts = []
    i = 0
    for m in SUBPARSERS.finditer(templ_str):
        ctx_name, subparser_name = m.groups()
        start, end = m.span()
        if i != start:
            parts.append(templ_str[i:start])
        parts.append((ctx_name or None, subparser_name))
        i = end

    if i < len(templ_str):
        parts.append(templ_str[i:])

    return parts


@dataclass(slots=True)
class BiTemplate:
    name: str
    template: list[str|tuple[str|None,str]] | re.Pattern | Callable
    ctx: dict[str, Any]

    def __init__(self, name, template_in, ctx):
        self.name = name
        self.ctx = ctx
        match template_in:
            case re.Pattern():
                self.template = template_in
            case _ if callable(template_in):
                self.template = template_in
            case _:
                self.template = compile(template_in)

@dataclass(frozen=True, slots=True)
class Alt:
    name: str
    alts: list[BiTemplate|Alt|str]
    ctx: dict[str, Any]

BASE_RULES = [
    BiTemplate("Var",
               re.compile(r'[A-Za-z_][A-Za-z0-9_]*'),
               {}
    ),
    BiTemplate("Something",
               re.compile(r'[\s\S]+'),
               {}
    ),
    BiTemplate("AnyPython",
               ast.parse,
               {}
    ),
    BiTemplate("Assignment",
               "{assign_var_name:Var} = {action_expr:Action}",
               {}
    ),
]

def make_grammar(rules: list[BiTemplate|Alt]) -> dict[str, BiTemplate|Alt]:
    return {rule.name: rule for rule in rules}


# Returns None if the generation fails, otherwise a tuple of the generated string and a list of (context key, prior template name consuming it)
def generate(
    grammar: dict[str, BiTemplate|Alt],
    bi_or_alt: BiTemplate|Alt,
    ctx: dict[str, Any],
    as_ctx_name: str | None = None,
    consumed: list[tuple[str, str]] = [] # list of (context key, prior template name consuming it)
) -> tuple[str, list[tuple[str, str]]] | None:
    rule_name  = bi_or_alt.name
    req_context = bi_or_alt.ctx
    for k, req_v in req_context.items():
        # False in requirements can match not present and None
        ctx_v = ctx.get(k, None)
        if req_v != ctx_v and (False, None) != (req_v, ctx_v):
            return None
        else:
            k_and_name = (k, rule_name)

            # If this rule has already consumed the key once, fail so we don't recurse forever
            if any(k_and_name == prior for prior in consumed):
                return None

            consumed = [*consumed, k_and_name]

    match bi_or_alt:
        case BiTemplate(_, templ_or_re, _):
            match templ_or_re:
                case re.Pattern(): # patterns or callables are always unparsed as ctx[as_ctx_name]
                    if as_ctx_name and as_ctx_name in ctx:
                        return (ctx[as_ctx_name], consumed)
                case _ if callable(templ_or_re):
                    if as_ctx_name and as_ctx_name in ctx:
                        return (ctx[as_ctx_name], consumed)
                case templ:
                    out_parts = []
                    for templ_part in cast(list[str|tuple[str|None, str]], templ):
                        match templ_part:
                            case (ctx_name, subparser_name):
                                part = generate(grammar, grammar[subparser_name], ctx, ctx_name, consumed)
                                if part is None:
                                    return None
                                part_str, consumed = part
                                out_parts.append(part_str)
                            case _:
                                out_parts.append(templ_part)
                    return (''.join(out_parts), consumed)

        case Alt(_, alts, _):
            for alt in alts:
                if isinstance(alt, str):
                    alt = grammar[alt]
                part = generate(grammar, alt, ctx, as_ctx_name, consumed)
                if part is not None:
                    return part


def parse(
    grammar: dict[str, BiTemplate|Alt],
    bi_or_alt: BiTemplate|Alt,
    string: str,
    ctx_in: dict = {}
) -> dict[str, Any] | None:
    for ctx, i in parse_bi_or_alt(grammar, bi_or_alt, string, ctx_in.copy()):
        if i == len(string):
            return ctx
    return None

def parse_bi_or_alt(
    grammar: dict[str, BiTemplate|Alt],
    bi_or_alt: BiTemplate|Alt,
    string: str,
    ctx_in: dict
) -> Iterator[tuple[dict[str, Any], int]]:
    rule_ctx = bi_or_alt.ctx
    ctx = merge_ctx(ctx_in, rule_ctx)

    if ctx is None:
        return

    match bi_or_alt:
        case BiTemplate(_, templ, _):
            itr = parse_bi_template(grammar, templ, string, ctx)
        case Alt(_, alts, _):
            itr = parse_alts(grammar, alts, string, ctx)

    yield from itr
    return

def parse_bi_template(
    grammar: dict[str, BiTemplate|Alt],
    templ: list[str|tuple[str|None,str]] | re.Pattern | Callable,
    string: str,
    ctx_in: dict
) -> Iterator[tuple[dict[str, Any], int]]:
    match templ:
        case re.Pattern() as regex:
            if (m := regex.match(string)) is not None:
                yield (ctx_in, m.end())
        case f if callable(f):
            for i in reversed(range(len(string)+1)):
                try:
                    if f(string[:i]):
                        yield (ctx_in, i)
                except Exception:
                    continue
        case parts:
            yield from parse_bi_parts(grammar, cast(list[str|tuple[str|None,str]], parts), string, ctx_in)


def overlapping_match_indexes(string: str, target: str) -> Iterator[int]:
    """Yield 0-based start indexes of all (potentially overlapping) occurrences of target in string."""
    if len(target) == 0:
        raise ValueError("target must be non-empty")
    i = 0
    while True:
        i = string.find(target, i)
        if i == -1:
            return
        yield i
        i += 1  # allow overlaps

def parse_bi_parts(
    grammar: dict[str, BiTemplate|Alt],
    parts: list[str|tuple[str|None,str]],
    string: str,
    ctx_in: dict
) -> Iterator[tuple[dict[str, Any], int]]:
    if len(parts) == 0:
        yield (ctx_in, 0)
        return

    next_lit_i = next((i for i, part in enumerate(parts) if isinstance(part, str)), None)
    if next_lit_i is None:
        yield from parse_nonlit_bi_parts(grammar, cast(list[tuple[str|None,str]], parts), string, ctx_in)
        return

    lit = cast(str, parts[next_lit_i])

    if next_lit_i == 0:
        if string.startswith(lit):
            for ctx, i in parse_bi_parts(grammar, parts[1:], string[len(lit):], ctx_in):
                yield (ctx, len(lit) + i)
        return

    leading_non_lits = cast(list[tuple[str|None,str]], parts[:next_lit_i])
    parts_after_lit = parts[next_lit_i+1:]

    for lit_i in overlapping_match_indexes(string, lit):
        leading_str = string[:lit_i]
        str_after_lit = string[lit_i+len(lit):]
        for (ctx2, i) in parse_nonlit_bi_parts(grammar, leading_non_lits, leading_str, ctx_in):
            # if i == len(leading_str):
            for (ctx3, j) in parse_bi_parts(grammar, parts_after_lit, str_after_lit, ctx2):
                yield (ctx3, lit_i + len(lit) + j)

    return


# hopefully parts is usually length 1
def parse_nonlit_bi_parts(
    grammar: dict[str, BiTemplate|Alt],
    parts: list[tuple[str|None,str]],
    string: str,
    ctx_in: dict
) -> Iterator[tuple[dict[str, Any], int]]:
    if len(parts) == 0:
        yield (ctx_in, 0)
        return

    p, *ps = parts

    ctx_name, rule_name = p

    for (ctx, i) in parse_bi_or_alt(grammar, grammar[rule_name], string, ctx_in):
        match_str = string[:i]
        if ctx_name:
            ctx = merge_ctx(ctx, {ctx_name: match_str})
            if ctx is None:
                continue

        for (ctx2, j) in parse_nonlit_bi_parts(grammar, ps, string[i:], ctx):
            yield (ctx2, i+j)

    return


def parse_alts(
    grammar: dict[str, BiTemplate|Alt],
    alts: list[BiTemplate|Alt|str],
    string: str,
    ctx_in: dict
) -> Iterator[tuple[dict[str, Any], int]]:
    for alt in alts:
        match alt:
            case BiTemplate() | Alt():
                yield from parse_bi_or_alt(grammar, alt, string, ctx_in)
            case rule_name:
                yield from parse_bi_or_alt(grammar, grammar[rule_name], string, ctx_in)

    return


# Returns none if contexts conflict. more effecient if ctx2 is smaller
def merge_ctx(ctx1: dict[str, Any], ctx2: dict[str, Any]) -> dict[str, Any] | None:
    out = ctx1.copy()

    for k2, v2 in ctx2.items():
        if k2 in ctx1:
            v1 = ctx1[k2]
            # contexts must match if overlap; None and False are allowed to match
            if v1 == v2 or (v1, v2) == (False, None) or (v1, v2) == (None, False):
                continue
            else:
                return None

        out[k2] = v2

    return out
