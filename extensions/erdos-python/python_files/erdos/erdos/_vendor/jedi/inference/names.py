from abc import abstractmethod
from inspect import Parameter
from typing import Optional, Tuple

from erdos.erdos._vendor.parso.tree import search_ancestor

from erdos.erdos._vendor.jedi.parser_utils import find_statement_documentation, clean_scope_docstring
from erdos.erdos._vendor.jedi.inference.utils import unite
from erdos.erdos._vendor.jedi.inference.base_value import ValueSet, NO_VALUES
from erdos.erdos._vendor.jedi.inference.cache import inference_state_method_cache
from erdos.erdos._vendor.jedi.inference import docstrings
from erdos.erdos._vendor.jedi.cache import memoize_method
from erdos.erdos._vendor.jedi.inference.helpers import deep_ast_copy, infer_call_of_leaf
from erdos.erdos._vendor.jedi.plugins import plugin_manager


def _merge_name_docs(names):
    doc = ''
    for name in names:
        if doc:
            # In case we have multiple values, just return all of them
            # separated by a few dashes.
            doc += '\n' + '-' * 30 + '\n'
        doc += name.py__doc__()
    return doc


class AbstractNameDefinition:
    start_pos: Optional[Tuple[int, int]] = None
    string_name: str
    parent_context = None
    tree_name = None
    is_value_name = True
    """
    Used for the Jedi API to know if it's a keyword or an actual name.
    """

    @abstractmethod
    def infer(self):
        raise NotImplementedError

    @abstractmethod
    def goto(self):
        # Typically names are already definitions and therefore a goto on that
        # name will always result on itself.
        return {self}

    def get_qualified_names(self, include_module_names=False):
        qualified_names = self._get_qualified_names()
        if qualified_names is None or not include_module_names:
            return qualified_names

        module_names = self.get_root_context().string_names
        if module_names is None:
            return None
        return module_names + qualified_names

    def _get_qualified_names(self):
        # By default, a name has no qualified names.
        return None

    def get_root_context(self):
        return self.parent_context.get_root_context()

    def get_public_name(self):
        return self.string_name

    def __repr__(self):
        if self.start_pos is None:
            return '<%s: string_name=%s>' % (self.__class__.__name__, self.string_name)
        return '<%s: string_name=%s start_pos=%s>' % (self.__class__.__name__,
                                                      self.string_name, self.start_pos)

    def is_import(self):
        return False

    def py__doc__(self):
        return ''

    @property
    def api_type(self):
        return self.parent_context.api_type

    def get_defining_qualified_value(self):
        """
        Returns either None or the value that is public and qualified. Won't
        return a function, because a name in a function is never public.
        """
        return None


class AbstractArbitraryName(AbstractNameDefinition):
    """
    When you e.g. want to complete dicts keys, you probably want to complete
    string literals, which is not really a name, but for Jedi we use this
    concept of Name for completions as well.
    """
    is_value_name = False

    def __init__(self, inference_state, string):
        self.inference_state = inference_state
        self.string_name = string
        self.parent_context = inference_state.builtins_module

    def infer(self):
        return NO_VALUES


class AbstractTreeName(AbstractNameDefinition):
    def __init__(self, parent_context, tree_name):
        self.parent_context = parent_context
        self.tree_name = tree_name

    def get_qualified_names(self, include_module_names=False):
        import_node = search_ancestor(self.tree_name, 'import_name', 'import_from')
        # For import nodes we cannot just have names, because it's very unclear
        # how they would look like. For now we just ignore them in most cases.
        # In case of level == 1, it works always, because it's like a submodule
        # lookup.
        if import_node is not None and not (import_node.level == 1
                                            and self.get_root_context().get_value().is_package()):
            # TODO improve the situation for when level is present.
            if include_module_names and not import_node.level:
                return tuple(n.value for n in import_node.get_path_for_name(self.tree_name))
            else:
                return None

        return super().get_qualified_names(include_module_names)

    def _get_qualified_names(self):
        parent_names = self.parent_context.get_qualified_names()
        if parent_names is None:
            return None
        return parent_names + (self.tree_name.value,)

    def get_defining_qualified_value(self):
        if self.is_import():
            raise NotImplementedError("Shouldn't really happen, please report")
        elif self.parent_context:
            return self.parent_context.get_value()  # Might be None
        return None

    def goto(self):
        context = self.parent_context
        name = self.tree_name
        definition = name.get_definition(import_name_always=True)
        if definition is not None:
            type_ = definition.type
            if type_ == 'expr_stmt':
                # Only take the parent, because if it's more complicated than just
                # a name it's something you can "goto" again.
                is_simple_name = name.parent.type not in ('power', 'trailer')
                if is_simple_name:
                    return [self]
            elif type_ in ('import_from', 'import_name'):
                from erdos.erdos._vendor.jedi.inference.imports import goto_import
                module_names = goto_import(context, name)
                return module_names
            else:
                return [self]
        else:
            from erdos.erdos._vendor.jedi.inference.imports import follow_error_node_imports_if_possible
            values = follow_error_node_imports_if_possible(context, name)
            if values is not None:
                return [value.name for value in values]

        par = name.parent
        node_type = par.type
        if node_type == 'argument' and par.children[1] == '=' and par.children[0] == name:
            # Named param goto.
            trailer = par.parent
            if trailer.type == 'arglist':
                trailer = trailer.parent
            if trailer.type != 'classdef':
                if trailer.type == 'decorator':
                    value_set = context.infer_node(trailer.children[1])
                else:
                    i = trailer.parent.children.index(trailer)
                    to_infer = trailer.parent.children[:i]
                    if to_infer[0] == 'await':
                        to_infer.pop(0)
                    value_set = context.infer_node(to_infer[0])
                    from erdos.erdos._vendor.jedi.inference.syntax_tree import infer_trailer
                    for trailer in to_infer[1:]:
                        value_set = infer_trailer(context, value_set, trailer)
                param_names = []
                for value in value_set:
                    for signature in value.get_signatures():
                        for param_name in signature.get_param_names():
                            if param_name.string_name == name.value:
                                param_names.append(param_name)
                return param_names
        elif node_type == 'dotted_name':  # Is a decorator.
            index = par.children.index(name)
            if index > 0:
                new_dotted = deep_ast_copy(par)
                new_dotted.children[index - 1:] = []
                values = context.infer_node(new_dotted)
                return unite(
                    value.goto(name, name_context=context)
                    for value in values
                )

        if node_type == 'trailer' and par.children[0] == '.':
            values = infer_call_of_leaf(context, name, cut_own_trailer=True)
            return values.goto(name, name_context=context)
        else:
            stmt = search_ancestor(
                name, 'expr_stmt', 'lambdef'
            ) or name
            if stmt.type == 'lambdef':
                stmt = name
            return context.goto(name, position=stmt.start_pos)

    def is_import(self):
        imp = search_ancestor(self.tree_name, 'import_from', 'import_name')
        return imp is not None

    @property
    def string_name(self):
        return self.tree_name.value

    @property
    def start_pos(self):
        return self.tree_name.start_pos


class ValueNameMixin:
    def infer(self):
        return ValueSet([self._value])

    def py__doc__(self):
        doc = self._value.py__doc__()
        if not doc and self._value.is_stub():
            from erdos.erdos._vendor.jedi.inference.gradual.conversion import convert_names
            names = convert_names([self], prefer_stub_to_compiled=False)
            if self not in names:
                return _merge_name_docs(names)
        return doc

    def _get_qualified_names(self):
        return self._value.get_qualified_names()

    def get_root_context(self):
        if self.parent_context is None:  # A module
            return self._value.as_context()
        return super().get_root_context()

    def get_defining_qualified_value(self):
        context = self.parent_context
        if context is not None and (context.is_module() or context.is_class()):
            return self.parent_context.get_value()  # Might be None
        return None

    @property
    def api_type(self):
        return self._value.api_type


class ValueName(ValueNameMixin, AbstractTreeName):
    def __init__(self, value, tree_name):
        super().__init__(value.parent_context, tree_name)
        self._value = value

    def goto(self):
        return ValueSet([self._value.name])


class TreeNameDefinition(AbstractTreeName):
    _API_TYPES = dict(
        import_name='module',
        import_from='module',
        funcdef='function',
        param='param',
        classdef='class',
    )

    def infer(self):
        # Refactor this, should probably be here.
        from erdos.erdos._vendor.jedi.inference.syntax_tree import tree_name_to_values
        return tree_name_to_values(
            self.parent_context.inference_state,
            self.parent_context,
            self.tree_name
        )

    @property
    def api_type(self):
        definition = self.tree_name.get_definition(import_name_always=True)
        if definition is None:
            return 'statement'
        return self._API_TYPES.get(definition.type, 'statement')

    def assignment_indexes(self):
        """
        Returns an array of tuple(int, node) of the indexes that are used in
        tuple assignments.

        For example if the name is ``y`` in the following code::

            x, (y, z) = 2, ''

        would result in ``[(1, xyz_node), (0, yz_node)]``.

        When searching for b in the case ``a, *b, c = [...]`` it will return::

            [(slice(1, -1), abc_node)]
        """
        indexes = []
        is_star_expr = False
        node = self.tree_name.parent
        compare = self.tree_name
        while node is not None:
            if node.type in ('testlist', 'testlist_comp', 'testlist_star_expr', 'exprlist'):
                for i, child in enumerate(node.children):
                    if child == compare:
                        index = int(i / 2)
                        if is_star_expr:
                            from_end = int((len(node.children) - i) / 2)
                            index = slice(index, -from_end)
                        indexes.insert(0, (index, node))
                        break
                else:
                    raise LookupError("Couldn't find the assignment.")
                is_star_expr = False
            elif node.type == 'star_expr':
                is_star_expr = True
            elif node.type in ('expr_stmt', 'sync_comp_for'):
                break

            compare = node
            node = node.parent
        return indexes

    @property
    def inference_state(self):
        # Used by the cache function below
        return self.parent_context.inference_state

    @inference_state_method_cache(default='')
    def py__doc__(self):
        api_type = self.api_type
        if api_type in ('function', 'class', 'property'):
            if self.parent_context.get_root_context().is_stub():
                from erdos.erdos._vendor.jedi.inference.gradual.conversion import convert_names
                names = convert_names([self], prefer_stub_to_compiled=False)
                if self not in names:
                    return _merge_name_docs(names)

            # Make sure the names are not TreeNameDefinitions anymore.
            return clean_scope_docstring(self.tree_name.get_definition())

        if api_type == 'module':
            names = self.goto()
            if self not in names:
                return _merge_name_docs(names)

        if api_type == 'statement' and self.tree_name.is_definition():
            return find_statement_documentation(self.tree_name.get_definition())
        return ''


class _ParamMixin:
    def maybe_positional_argument(self, include_star=True):
        options = [Parameter.POSITIONAL_ONLY, Parameter.POSITIONAL_OR_KEYWORD]
        if include_star:
            options.append(Parameter.VAR_POSITIONAL)
        return self.get_kind() in options

    def maybe_keyword_argument(self, include_stars=True):
        options = [Parameter.KEYWORD_ONLY, Parameter.POSITIONAL_OR_KEYWORD]
        if include_stars:
            options.append(Parameter.VAR_KEYWORD)
        return self.get_kind() in options

    def _kind_string(self):
        kind = self.get_kind()
        if kind == Parameter.VAR_POSITIONAL:  # *args
            return '*'
        if kind == Parameter.VAR_KEYWORD:  # **kwargs
            return '**'
        return ''

    def get_qualified_names(self, include_module_names=False):
        return None


class ParamNameInterface(_ParamMixin):
    api_type = 'param'

    def get_kind(self):
        raise NotImplementedError

    def to_string(self):
        raise NotImplementedError

    def get_executed_param_name(self):
        """
        For dealing with type inference and working around the graph, we
        sometimes want to have the param name of the execution. This feels a
        bit strange and we might have to refactor at some point.

        For now however it exists to avoid infering params when we don't really
        need them (e.g. when we can just instead use annotations.
        """
        return None

    @property
    def star_count(self):
        kind = self.get_kind()
        if kind == Parameter.VAR_POSITIONAL:
            return 1
        if kind == Parameter.VAR_KEYWORD:
            return 2
        return 0

    def infer_default(self):
        return NO_VALUES


class BaseTreeParamName(ParamNameInterface, AbstractTreeName):
    annotation_node = None
    default_node = None

    def to_string(self):
        output = self._kind_string() + self.get_public_name()
        annotation = self.annotation_node
        default = self.default_node
        if annotation is not None:
            output += ': ' + annotation.get_code(include_prefix=False)
        if default is not None:
            output += '=' + default.get_code(include_prefix=False)
        return output

    def get_public_name(self):
        name = self.string_name
        if name.startswith('__'):
            # Params starting with __ are an equivalent to positional only
            # variables in typeshed.
            name = name[2:]
        return name

    def goto(self, **kwargs):
        return [self]


class _ActualTreeParamName(BaseTreeParamName):
    def __init__(self, function_value, tree_name):
        super().__init__(
            function_value.get_default_param_context(), tree_name)
        self.function_value = function_value

    def _get_param_node(self):
        return search_ancestor(self.tree_name, 'param')

    @property
    def annotation_node(self):
        return self._get_param_node().annotation

    def infer_annotation(self, execute_annotation=True, ignore_stars=False):
        from erdos.erdos._vendor.jedi.inference.gradual.annotation import infer_param
        values = infer_param(
            self.function_value, self._get_param_node(),
            ignore_stars=ignore_stars)
        if execute_annotation:
            values = values.execute_annotation()
        return values

    def infer_default(self):
        node = self.default_node
        if node is None:
            return NO_VALUES
        return self.parent_context.infer_node(node)

    @property
    def default_node(self):
        return self._get_param_node().default

    def get_kind(self):
        tree_param = self._get_param_node()
        if tree_param.star_count == 1:  # *args
            return Parameter.VAR_POSITIONAL
        if tree_param.star_count == 2:  # **kwargs
            return Parameter.VAR_KEYWORD

        # Params starting with __ are an equivalent to positional only
        # variables in typeshed.
        if tree_param.name.value.startswith('__'):
            return Parameter.POSITIONAL_ONLY

        parent = tree_param.parent
        param_appeared = False
        for p in parent.children:
            if param_appeared:
                if p == '/':
                    return Parameter.POSITIONAL_ONLY
            else:
                if p == '*':
                    return Parameter.KEYWORD_ONLY
                if p.type == 'param':
                    if p.star_count:
                        return Parameter.KEYWORD_ONLY
                    if p == tree_param:
                        param_appeared = True
        return Parameter.POSITIONAL_OR_KEYWORD

    def infer(self):
        values = self.infer_annotation()
        if values:
            return values

        doc_params = docstrings.infer_param(self.function_value, self._get_param_node())
        return doc_params


class AnonymousParamName(_ActualTreeParamName):
    @plugin_manager.decorate(name='goto_anonymous_param')
    def goto(self):
        return super().goto()

    @plugin_manager.decorate(name='infer_anonymous_param')
    def infer(self):
        values = super().infer()
        if values:
            return values
        from erdos.erdos._vendor.jedi.inference.dynamic_params import dynamic_param_lookup
        param = self._get_param_node()
        values = dynamic_param_lookup(self.function_value, param.position_index)
        if values:
            return values

        if param.star_count == 1:
            from erdos.erdos._vendor.jedi.inference.value.iterable import FakeTuple
            value = FakeTuple(self.function_value.inference_state, [])
        elif param.star_count == 2:
            from erdos.erdos._vendor.jedi.inference.value.iterable import FakeDict
            value = FakeDict(self.function_value.inference_state, {})
        elif param.default is None:
            return NO_VALUES
        else:
            return self.function_value.parent_context.infer_node(param.default)
        return ValueSet({value})


class ParamName(_ActualTreeParamName):
    def __init__(self, function_value, tree_name, arguments):
        super().__init__(function_value, tree_name)
        self.arguments = arguments

    def infer(self):
        values = super().infer()
        if values:
            return values

        return self.get_executed_param_name().infer()

    def get_executed_param_name(self):
        from erdos.erdos._vendor.jedi.inference.param import get_executed_param_names
        params_names = get_executed_param_names(self.function_value, self.arguments)
        return params_names[self._get_param_node().position_index]


class ParamNameWrapper(_ParamMixin):
    def __init__(self, param_name):
        self._wrapped_param_name = param_name

    def __getattr__(self, name):
        return getattr(self._wrapped_param_name, name)

    def __repr__(self):
        return '<%s: %s>' % (self.__class__.__name__, self._wrapped_param_name)


class ImportName(AbstractNameDefinition):
    start_pos = (1, 0)
    _level = 0

    def __init__(self, parent_context, string_name):
        self._from_module_context = parent_context
        self.string_name = string_name

    def get_qualified_names(self, include_module_names=False):
        if include_module_names:
            if self._level:
                assert self._level == 1, "Everything else is not supported for now"
                module_names = self._from_module_context.string_names
                if module_names is None:
                    return module_names
                return module_names + (self.string_name,)
            return (self.string_name,)
        return ()

    @property
    def parent_context(self):
        m = self._from_module_context
        import_values = self.infer()
        if not import_values:
            return m
        # It's almost always possible to find the import or to not find it. The
        # importing returns only one value, pretty much always.
        return next(iter(import_values)).as_context()

    @memoize_method
    def infer(self):
        from erdos.erdos._vendor.jedi.inference.imports import Importer
        m = self._from_module_context
        return Importer(m.inference_state, [self.string_name], m, level=self._level).follow()

    def goto(self):
        return [m.name for m in self.infer()]

    @property
    def api_type(self):
        return 'module'

    def py__doc__(self):
        return _merge_name_docs(self.goto())


class SubModuleName(ImportName):
    _level = 1


class NameWrapper:
    def __init__(self, wrapped_name):
        self._wrapped_name = wrapped_name

    def __getattr__(self, name):
        return getattr(self._wrapped_name, name)

    def __repr__(self):
        return '%s(%s)' % (self.__class__.__name__, self._wrapped_name)


class StubNameMixin:
    def py__doc__(self):
        from erdos.erdos._vendor.jedi.inference.gradual.conversion import convert_names
        # Stubs are not complicated and we can just follow simple statements
        # that have an equals in them, because they typically make something
        # else public. See e.g. stubs for `requests`.
        names = [self]
        if self.api_type == 'statement' and '=' in self.tree_name.get_definition().children:
            names = [v.name for v in self.infer()]

        names = convert_names(names, prefer_stub_to_compiled=False)
        if self in names:
            return super().py__doc__()
        else:
            # We have signatures ourselves in stubs, so don't use signatures
            # from the implementation.
            return _merge_name_docs(names)


# From here on down we make looking up the sys.version_info fast.
class StubName(StubNameMixin, TreeNameDefinition):
    def infer(self):
        inferred = super().infer()
        if self.string_name == 'version_info' and self.get_root_context().py__name__() == 'sys':
            from erdos.erdos._vendor.jedi.inference.gradual.stub_value import VersionInfo
            return ValueSet(VersionInfo(c) for c in inferred)
        return inferred


class ModuleName(ValueNameMixin, AbstractNameDefinition):
    start_pos = 1, 0

    def __init__(self, value, name):
        self._value = value
        self._name = name

    @property
    def string_name(self):
        return self._name


class StubModuleName(StubNameMixin, ModuleName):
    pass
