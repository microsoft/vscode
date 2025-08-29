"""
Type inference of Python code in |jedi| is based on three assumptions:

* The code uses as least side effects as possible. Jedi understands certain
  list/tuple/set modifications, but there's no guarantee that Jedi detects
  everything (list.append in different modules for example).
* No magic is being used:

  - metaclasses
  - ``setattr()`` / ``__import__()``
  - writing to ``globals()``, ``locals()``, ``object.__dict__``
* The programmer is not a total dick, e.g. like `this
  <https://github.com/davidhalter/jedi/issues/24>`_ :-)

The actual algorithm is based on a principle I call lazy type inference.  That
said, the typical entry point for static analysis is calling
``infer_expr_stmt``. There's separate logic for autocompletion in the API, the
inference_state is all about inferring an expression.

TODO this paragraph is not what jedi does anymore, it's similar, but not the
same.

Now you need to understand what follows after ``infer_expr_stmt``. Let's
make an example::

    import datetime
    datetime.date.toda# <-- cursor here

First of all, this module doesn't care about completion. It really just cares
about ``datetime.date``. At the end of the procedure ``infer_expr_stmt`` will
return the ``date`` class.

To *visualize* this (simplified):

- ``InferenceState.infer_expr_stmt`` doesn't do much, because there's no assignment.
- ``Context.infer_node`` cares for resolving the dotted path
- ``InferenceState.find_types`` searches for global definitions of datetime, which
  it finds in the definition of an import, by scanning the syntax tree.
- Using the import logic, the datetime module is found.
- Now ``find_types`` is called again by ``infer_node`` to find ``date``
  inside the datetime module.

Now what would happen if we wanted ``datetime.date.foo.bar``? Two more
calls to ``find_types``. However the second call would be ignored, because the
first one would return nothing (there's no foo attribute in ``date``).

What if the import would contain another ``ExprStmt`` like this::

    from foo import bar
    Date = bar.baz

Well... You get it. Just another ``infer_expr_stmt`` recursion. It's really
easy. Python can obviously get way more complicated then this. To understand
tuple assignments, list comprehensions and everything else, a lot more code had
to be written.

Jedi has been tested very well, so you can just start modifying code. It's best
to write your own test first for your "new" feature. Don't be scared of
breaking stuff. As long as the tests pass, you're most likely to be fine.

I need to mention now that lazy type inference is really good because it
only *inferes* what needs to be *inferred*. All the statements and modules
that are not used are just being ignored.
"""
import lotas.erdos._vendor.parso as parso
from lotas.erdos._vendor.jedi.file_io import FileIO

from jedi import debug
from jedi import settings
from lotas.erdos._vendor.jedi.inference import imports
from lotas.erdos._vendor.jedi.inference import recursion
from lotas.erdos._vendor.jedi.inference.cache import inference_state_function_cache
from lotas.erdos._vendor.jedi.inference import helpers
from lotas.erdos._vendor.jedi.inference.names import TreeNameDefinition
from lotas.erdos._vendor.jedi.inference.base_value import ContextualizedNode, \
    ValueSet, iterate_values
from lotas.erdos._vendor.jedi.inference.value import ClassValue, FunctionValue
from lotas.erdos._vendor.jedi.inference.syntax_tree import infer_expr_stmt, \
    check_tuple_assignments, tree_name_to_values
from lotas.erdos._vendor.jedi.inference.imports import follow_error_node_imports_if_possible
from lotas.erdos._vendor.jedi.plugins import plugin_manager


class InferenceState:
    def __init__(self, project, environment=None, script_path=None):
        if environment is None:
            environment = project.get_environment()
        self.environment = environment
        self.script_path = script_path
        self.compiled_subprocess = environment.get_inference_state_subprocess(self)
        self.grammar = environment.get_grammar()

        self.latest_grammar = parso.load_grammar(version='3.13')
        self.memoize_cache = {}  # for memoize decorators
        self.module_cache = imports.ModuleCache()  # does the job of `sys.modules`.
        self.stub_module_cache = {}  # Dict[Tuple[str, ...], Optional[ModuleValue]]
        self.compiled_cache = {}  # see `inference.compiled.create()`
        self.inferred_element_counts = {}
        self.mixed_cache = {}  # see `inference.compiled.mixed._create()`
        self.analysis = []
        self.dynamic_params_depth = 0
        self.do_dynamic_params_search = settings.dynamic_params
        self.is_analysis = False
        self.project = project
        self.access_cache = {}
        self.allow_unsafe_executions = False
        self.flow_analysis_enabled = True

        self.reset_recursion_limitations()

    def import_module(self, import_names, sys_path=None, prefer_stubs=True):
        return imports.import_module_by_names(
            self, import_names, sys_path, prefer_stubs=prefer_stubs)

    @staticmethod
    @plugin_manager.decorate()
    def execute(value, arguments):
        debug.dbg('execute: %s %s', value, arguments)
        with debug.increase_indent_cm():
            value_set = value.py__call__(arguments=arguments)
        debug.dbg('execute result: %s in %s', value_set, value)
        return value_set

    # mypy doesn't suppport decorated propeties (https://github.com/python/mypy/issues/1362)
    @property  # type: ignore[misc]
    @inference_state_function_cache()
    def builtins_module(self):
        module_name = 'builtins'
        builtins_module, = self.import_module((module_name,), sys_path=[])
        return builtins_module

    @property  # type: ignore[misc]
    @inference_state_function_cache()
    def typing_module(self):
        typing_module, = self.import_module(('typing',))
        return typing_module

    def reset_recursion_limitations(self):
        self.recursion_detector = recursion.RecursionDetector()
        self.execution_recursion_detector = recursion.ExecutionRecursionDetector(self)

    def get_sys_path(self, **kwargs):
        """Convenience function"""
        return self.project._get_sys_path(self, **kwargs)

    def infer(self, context, name):
        def_ = name.get_definition(import_name_always=True)
        if def_ is not None:
            type_ = def_.type
            is_classdef = type_ == 'classdef'
            if is_classdef or type_ == 'funcdef':
                if is_classdef:
                    c = ClassValue(self, context, name.parent)
                else:
                    c = FunctionValue.from_context(context, name.parent)
                return ValueSet([c])

            if type_ == 'expr_stmt':
                is_simple_name = name.parent.type not in ('power', 'trailer')
                if is_simple_name:
                    return infer_expr_stmt(context, def_, name)
            if type_ == 'for_stmt':
                container_types = context.infer_node(def_.children[3])
                cn = ContextualizedNode(context, def_.children[3])
                for_types = iterate_values(container_types, cn)
                n = TreeNameDefinition(context, name)
                return check_tuple_assignments(n, for_types)
            if type_ in ('import_from', 'import_name'):
                return imports.infer_import(context, name)
            if type_ == 'with_stmt':
                return tree_name_to_values(self, context, name)
            elif type_ == 'param':
                return context.py__getattribute__(name.value, position=name.end_pos)
            elif type_ == 'namedexpr_test':
                return context.infer_node(def_)
        else:
            result = follow_error_node_imports_if_possible(context, name)
            if result is not None:
                return result

        return helpers.infer_call_of_leaf(context, name)

    def parse_and_get_code(self, code=None, path=None,
                           use_latest_grammar=False, file_io=None, **kwargs):
        if code is None:
            if file_io is None:
                file_io = FileIO(path)
            code = file_io.read()
        # We cannot just use parso, because it doesn't use errors='replace'.
        code = parso.python_bytes_to_unicode(code, encoding='utf-8', errors='replace')

        if len(code) > settings._cropped_file_size:
            code = code[:settings._cropped_file_size]

        grammar = self.latest_grammar if use_latest_grammar else self.grammar
        return grammar.parse(code=code, path=path, file_io=file_io, **kwargs), code

    def parse(self, *args, **kwargs):
        return self.parse_and_get_code(*args, **kwargs)[0]
