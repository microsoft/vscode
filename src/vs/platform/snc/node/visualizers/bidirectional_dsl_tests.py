import pytest
import re
import ast
from bidirectional_dsl import (
    compile, BiTemplate, Alt, BASE_RULES,
    make_grammar, generate, parse, merge_ctx, overlapping_match_indexes,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def regex_grammar():
    """Full grammar for regex find-all assignments (flags, raw strings, etc.)."""
    return make_grammar(BASE_RULES + [
        BiTemplate("Map",
                   "[{repl_expr:AnyPython} for {match_var:Var} in {iter_expr:IterExp}]",
                   {}),
        BiTemplate("IterExp",
                   "re.finditer({:SearchExp}, {var_to_search:Var}{:PerhapsFlags})",
                   {}),
        Alt("Action", ["Map"], {}),
        Alt("SearchExp",
            [BiTemplate("RawStrHtmlEscape", "r're.escape({expr:Something})'", {'is_expr': True}),
             BiTemplate("RawStr", "r'{regex_pattern:Something}'", {})],
            {}),
        Alt("PerhapsFlags",
            [BiTemplate("RegexFlags",  ", flags={:ReFlags}", {}),
             BiTemplate("ExprNoFlags", "",                   {'ci': False})],
            {}),
        Alt("ReFlags",
            [BiTemplate("MultipleFlags", "{:ReOneFlag}|{:ReFlags}", {}),
             BiTemplate("FinalFlag",     "{:ReOneFlag}",            {})],
            {}),
        Alt("ReOneFlag",
            [BiTemplate("ReMFlag", "re.I", {'ci': True}),
             BiTemplate("ReIFlag", "re.M", {'is_expr': False})],
            {}),
    ])


# ---------------------------------------------------------------------------
# compile()
# ---------------------------------------------------------------------------

class TestCompile:
    def test_plain_text(self):
        assert compile("hello world") == ["hello world"]

    def test_single_named_subparser(self):
        assert compile("{foo:Bar}") == [("foo", "Bar")]

    def test_unnamed_subparser(self):
        assert compile("{:Bar}") == [(None, "Bar")]

    def test_named_ctx(self):
        assert compile("{name:Rule}") == [("name", "Rule")]

    def test_mixed_literal_and_subparsers(self):
        parts = compile("x = {v:Var}")
        assert parts == ["x = ", ("v", "Var")]

    def test_adjacent_subparsers(self):
        parts = compile("{a:A}{b:B}")
        assert parts == [("a", "A"), ("b", "B")]

    def test_trailing_text(self):
        parts = compile("{a:A} end")
        assert parts == [("a", "A"), " end"]

    def test_empty_string(self):
        assert compile("") == []


# ---------------------------------------------------------------------------
# BiTemplate.__init__ dispatch
# ---------------------------------------------------------------------------

class TestBiTemplateInit:
    def test_string_template_compiles(self):
        bt = BiTemplate("T", "{x:Y} lit", {})
        assert bt.template == [("x", "Y"), " lit"]

    def test_regex_stored_directly(self):
        pat = re.compile(r'\d+')
        bt = BiTemplate("T", pat, {})
        assert bt.template is pat

    def test_callable_stored_directly(self):
        bt = BiTemplate("T", ast.parse, {})
        assert bt.template is ast.parse


# ---------------------------------------------------------------------------
# merge_ctx()
# ---------------------------------------------------------------------------

class TestMergeCtx:
    def test_disjoint(self):
        assert merge_ctx({'a': 1}, {'b': 2}) == {'a': 1, 'b': 2}

    def test_matching_overlap(self):
        assert merge_ctx({'a': 1}, {'a': 1}) == {'a': 1}

    def test_conflict_returns_none(self):
        assert merge_ctx({'a': 1}, {'a': 2}) is None

    def test_false_none_equivalence(self):
        assert merge_ctx({'a': False}, {'a': None}) == {'a': False}

    def test_none_false_equivalence(self):
        assert merge_ctx({'a': None}, {'a': False}) == {'a': None}

    def test_empty_ctxs(self):
        assert merge_ctx({}, {}) == {}

    def test_one_empty(self):
        assert merge_ctx({'a': 1}, {}) == {'a': 1}


# ---------------------------------------------------------------------------
# overlapping_match_indexes()
# ---------------------------------------------------------------------------

class TestOverlappingMatchIndexes:
    def test_basic(self):
        assert list(overlapping_match_indexes("abab", "ab")) == [0, 2]

    def test_overlapping(self):
        assert list(overlapping_match_indexes("aaa", "aa")) == [0, 1]

    def test_no_match(self):
        assert list(overlapping_match_indexes("abc", "z")) == []

    def test_empty_target_raises(self):
        with pytest.raises(ValueError):
            list(overlapping_match_indexes("abc", ""))


# ---------------------------------------------------------------------------
# generate()
# ---------------------------------------------------------------------------

class TestGenerate:
    def test_simple_regex_rule(self):
        g = make_grammar(BASE_RULES)
        result = generate(g, g['Var'], {'assign_var_name': 'x'}, 'assign_var_name')
        assert result is not None
        assert result[0] == 'x'

    def test_callable_rule(self):
        g = make_grammar(BASE_RULES)
        result = generate(g, g['AnyPython'], {'expr': 'x + 1'}, 'expr')
        assert result is not None
        assert result[0] == 'x + 1'

    def test_context_mismatch_returns_none(self):
        rule = BiTemplate("R", "lit", {'key': 'required_value'})
        g = make_grammar([rule])
        assert generate(g, rule, {'key': 'wrong'}) is None

    def test_context_false_matches_absent(self):
        rule = BiTemplate("R", re.compile(r'.*'), {'flag': False})
        g = make_grammar([rule])
        result = generate(g, rule, {}, 'x')
        # flag=False required, ctx has no 'flag' → ctx.get returns None, (False,None) match
        assert result is None  # but as_ctx_name='x' not in ctx so regex/callable branch returns None

    def test_alt_picks_first_match(self, regex_grammar):
        """ci=False still generates re.M because ReIFlag ctx {is_expr:False} matches absent is_expr."""
        ctx = {'assign_var_name': 'out', 'match_var': 'm', 'repl_expr': 'm[0]',
               'var_to_search': 's', 'regex_pattern': 'pat', 'ci': False}
        result = generate(regex_grammar, regex_grammar['Assignment'], ctx)
        assert result is not None
        assert result[0] == "out = [m[0] for m in re.finditer(r'pat', s, flags=re.M)]"

    def test_full_generation_with_flags(self, regex_grammar):
        ctx = {'assign_var_name': 'str2', 'match_var': '_mtch', 'repl_expr': '_mtch[0]',
               'var_to_search': 'str1', 'regex_pattern': 'x', 'ci': True}
        result = generate(regex_grammar, regex_grammar['Assignment'], ctx)
        assert result is not None
        assert result[0] == "str2 = [_mtch[0] for _mtch in re.finditer(r'x', str1, flags=re.I|re.M)]"

    def test_generate_escape_variant(self, regex_grammar):
        ctx = {'assign_var_name': 'r', 'match_var': 'm', 'repl_expr': 'm[0]',
               'var_to_search': 's', 'expr': 'needle', 'is_expr': True, 'ci': False}
        result = generate(regex_grammar, regex_grammar['Assignment'], ctx)
        assert result is not None
        assert "re.escape(needle)" in result[0]


# ---------------------------------------------------------------------------
# parse()
# ---------------------------------------------------------------------------

class TestParse:
    def test_parse_simple_var(self):
        g = make_grammar(BASE_RULES)
        ctx = parse(g, g['Var'], "hello")
        assert ctx is not None
        assert ctx == {}

    def test_parse_no_match_returns_none(self):
        g = make_grammar(BASE_RULES)
        assert parse(g, g['Var'], "123bad") is None

    def test_parse_regex_partial_no_match(self):
        """Var regex matches 'a1' but not the full string 'a1 !!' — parse requires full consumption."""
        g = make_grammar(BASE_RULES)
        assert parse(g, g['Var'], "a1 !!") is None

    def test_parse_callable_branch(self):
        g = make_grammar(BASE_RULES)
        ctx = parse(g, g['AnyPython'], "x + 1")
        assert ctx is not None

    def test_parse_callable_no_match(self):
        g = make_grammar(BASE_RULES)
        assert parse(g, g['AnyPython'], "def") is None

    def test_parse_full_assignment_no_flags(self, regex_grammar):
        code = "out = [m[0] for m in re.finditer(r'pat', src)]"
        ctx = parse(regex_grammar, regex_grammar['Assignment'], code)
        assert ctx is not None
        assert ctx['assign_var_name'] == 'out'
        assert ctx['regex_pattern'] == 'pat'
        assert ctx['var_to_search'] == 'src'
        assert ctx['match_var'] == 'm'
        assert ctx['repl_expr'] == 'm[0]'
        assert ctx['ci'] is False

    def test_parse_full_assignment_with_flags(self, regex_grammar):
        code = "str2 = [_mtch[0] for _mtch in re.finditer(r'x', str1, flags=re.I|re.M)]"
        ctx = parse(regex_grammar, regex_grammar['Assignment'], code)
        assert ctx is not None
        assert ctx['assign_var_name'] == 'str2'
        assert ctx['ci'] is True
        assert ctx['regex_pattern'] == 'x'

    def test_parse_escape_variant(self, regex_grammar):
        code = "r = [m[0] for m in re.finditer(r're.escape(needle)', s)]"
        ctx = parse(regex_grammar, regex_grammar['Assignment'], code)
        assert ctx is not None
        assert ctx['expr'] == 'needle'
        assert ctx['is_expr'] is True

    def test_parse_with_ctx_in(self):
        g = make_grammar(BASE_RULES)
        ctx = parse(g, g['Var'], "hello", ctx_in={'extra': 42})
        assert ctx is not None
        assert ctx['extra'] == 42

    def test_parse_ctx_in_conflict(self, regex_grammar):
        """Seeding ctx_in with a value that conflicts with what the parse would produce → None."""
        code = "out = [m[0] for m in re.finditer(r'pat', src)]"
        ctx = parse(regex_grammar, regex_grammar['Assignment'], code, ctx_in={'assign_var_name': 'WRONG'})
        assert ctx is None

    def test_parse_alt_context_gating(self, regex_grammar):
        """Alt with context requirements skips branches whose ctx doesn't match."""
        code = "a = [m[0] for m in re.finditer(r'p', s, flags=re.I)]"
        ctx = parse(regex_grammar, regex_grammar['Assignment'], code)
        assert ctx is not None
        assert ctx['ci'] is True


# ---------------------------------------------------------------------------
# Roundtrip: generate → parse → generate
# ---------------------------------------------------------------------------

class TestRoundtrip:
    @pytest.mark.parametrize("ctx", [
        {'assign_var_name': 'str2', 'match_var': '_mtch', 'repl_expr': '_mtch[0]',
         'var_to_search': 'str1', 'regex_pattern': 'x', 'ci': True},
        {'assign_var_name': 'out', 'match_var': 'm', 'repl_expr': 'm.group()',
         'var_to_search': 'data', 'regex_pattern': r'\d+', 'ci': False},
        {'assign_var_name': 'r', 'match_var': 'm', 'repl_expr': 'm[0]',
         'var_to_search': 's', 'expr': 'needle', 'is_expr': True, 'ci': False},
    ])
    def test_roundtrip(self, regex_grammar, ctx):
        gen_result = generate(regex_grammar, regex_grammar['Assignment'], ctx)
        assert gen_result is not None
        code, _ = gen_result

        parsed_ctx = parse(regex_grammar, regex_grammar['Assignment'], code)
        assert parsed_ctx is not None

        regen_result = generate(regex_grammar, regex_grammar['Assignment'], parsed_ctx)
        assert regen_result is not None
        assert regen_result[0] == code
