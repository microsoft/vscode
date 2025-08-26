"""
:mod:`jedi.inference.imports` is here to resolve import statements and return
the modules/classes/functions/whatever, which they stand for. However there's
not any actual importing done. This module is about finding modules in the
filesystem. This can be quite tricky sometimes, because Python imports are not
always that simple.

This module also supports import autocompletion, which means to complete
statements like ``from datetim`` (cursor at the end would return ``datetime``).
"""
import os
from pathlib import Path

from lotas.erdos._vendor.parso.python import tree
from lotas.erdos._vendor.parso.tree import search_ancestor

from jedi import debug
from jedi import settings
from lotas.erdos._vendor.jedi.file_io import FolderIO
from lotas.erdos._vendor.jedi.parser_utils import get_cached_code_lines
from lotas.erdos._vendor.jedi.inference import sys_path
from lotas.erdos._vendor.jedi.inference import helpers
from lotas.erdos._vendor.jedi.inference import compiled
from lotas.erdos._vendor.jedi.inference import analysis
from lotas.erdos._vendor.jedi.inference.utils import unite
from lotas.erdos._vendor.jedi.inference.cache import inference_state_method_cache
from lotas.erdos._vendor.jedi.inference.names import ImportName, SubModuleName
from lotas.erdos._vendor.jedi.inference.base_value import ValueSet, NO_VALUES
from lotas.erdos._vendor.jedi.inference.gradual.typeshed import import_module_decorator, \
    create_stub_module, parse_stub_module
from lotas.erdos._vendor.jedi.inference.compiled.subprocess.functions import ImplicitNSInfo
from lotas.erdos._vendor.jedi.plugins import plugin_manager


class ModuleCache:
    def __init__(self):
        self._name_cache = {}

    def add(self, string_names, value_set):
        if string_names is not None:
            self._name_cache[string_names] = value_set

    def get(self, string_names):
        return self._name_cache.get(string_names)


# This memoization is needed, because otherwise we will infinitely loop on
# certain imports.
@inference_state_method_cache(default=NO_VALUES)
def infer_import(context, tree_name):
    module_context = context.get_root_context()
    from_import_name, import_path, level, values = \
        _prepare_infer_import(module_context, tree_name)
    if values:

        if from_import_name is not None:
            values = values.py__getattribute__(
                from_import_name,
                name_context=context,
                analysis_errors=False
            )

            if not values:
                path = import_path + (from_import_name,)
                importer = Importer(context.inference_state, path, module_context, level)
                values = importer.follow()
    debug.dbg('after import: %s', values)
    return values


@inference_state_method_cache(default=[])
def goto_import(context, tree_name):
    module_context = context.get_root_context()
    from_import_name, import_path, level, values = \
        _prepare_infer_import(module_context, tree_name)
    if not values:
        return []

    if from_import_name is not None:
        names = unite([
            c.goto(
                from_import_name,
                name_context=context,
                analysis_errors=False
            ) for c in values
        ])
        # Avoid recursion on the same names.
        if names and not any(n.tree_name is tree_name for n in names):
            return names

        path = import_path + (from_import_name,)
        importer = Importer(context.inference_state, path, module_context, level)
        values = importer.follow()
    return set(s.name for s in values)


def _prepare_infer_import(module_context, tree_name):
    import_node = search_ancestor(tree_name, 'import_name', 'import_from')
    import_path = import_node.get_path_for_name(tree_name)
    from_import_name = None
    try:
        from_names = import_node.get_from_names()
    except AttributeError:
        # Is an import_name
        pass
    else:
        if len(from_names) + 1 == len(import_path):
            # We have to fetch the from_names part first and then check
            # if from_names exists in the modules.
            from_import_name = import_path[-1]
            import_path = from_names

    importer = Importer(module_context.inference_state, tuple(import_path),
                        module_context, import_node.level)

    return from_import_name, tuple(import_path), import_node.level, importer.follow()


def _add_error(value, name, message):
    if hasattr(name, 'parent') and value is not None:
        analysis.add(value, 'import-error', name, message)
    else:
        debug.warning('ImportError without origin: ' + message)


def _level_to_base_import_path(project_path, directory, level):
    """
    In case the level is outside of the currently known package (something like
    import .....foo), we can still try our best to help the user for
    completions.
    """
    for i in range(level - 1):
        old = directory
        directory = os.path.dirname(directory)
        if old == directory:
            return None, None

    d = directory
    level_import_paths = []
    # Now that we are on the level that the user wants to be, calculate the
    # import path for it.
    while True:
        if d == project_path:
            return level_import_paths, d
        dir_name = os.path.basename(d)
        if dir_name:
            level_import_paths.insert(0, dir_name)
            d = os.path.dirname(d)
        else:
            return None, directory


class Importer:
    def __init__(self, inference_state, import_path, module_context, level=0):
        """
        An implementation similar to ``__import__``. Use `follow`
        to actually follow the imports.

        *level* specifies whether to use absolute or relative imports. 0 (the
        default) means only perform absolute imports. Positive values for level
        indicate the number of parent directories to search relative to the
        directory of the module calling ``__import__()`` (see PEP 328 for the
        details).

        :param import_path: List of namespaces (strings or Names).
        """
        debug.speed('import %s %s' % (import_path, module_context))
        self._inference_state = inference_state
        self.level = level
        self._module_context = module_context

        self._fixed_sys_path = None
        self._infer_possible = True
        if level:
            base = module_context.get_value().py__package__()
            # We need to care for two cases, the first one is if it's a valid
            # Python import. This import has a properly defined module name
            # chain like `foo.bar.baz` and an import in baz is made for
            # `..lala.` It can then resolve to `foo.bar.lala`.
            # The else here is a heuristic for all other cases, if for example
            # in `foo` you search for `...bar`, it's obviously out of scope.
            # However since Jedi tries to just do it's best, we help the user
            # here, because he might have specified something wrong in his
            # project.
            if level <= len(base):
                # Here we basically rewrite the level to 0.
                base = tuple(base)
                if level > 1:
                    base = base[:-level + 1]
                import_path = base + tuple(import_path)
            else:
                path = module_context.py__file__()
                project_path = self._inference_state.project.path
                import_path = list(import_path)
                if path is None:
                    # If no path is defined, our best guess is that the current
                    # file is edited by a user on the current working
                    # directory. We need to add an initial path, because it
                    # will get removed as the name of the current file.
                    directory = project_path
                else:
                    directory = os.path.dirname(path)

                base_import_path, base_directory = _level_to_base_import_path(
                    project_path, directory, level,
                )
                if base_directory is None:
                    # Everything is lost, the relative import does point
                    # somewhere out of the filesystem.
                    self._infer_possible = False
                else:
                    self._fixed_sys_path = [base_directory]

                if base_import_path is None:
                    if import_path:
                        _add_error(
                            module_context, import_path[0],
                            message='Attempted relative import beyond top-level package.'
                        )
                else:
                    import_path = base_import_path + import_path
        self.import_path = import_path

    @property
    def _str_import_path(self):
        """Returns the import path as pure strings instead of `Name`."""
        return tuple(
            name.value if isinstance(name, tree.Name) else name
            for name in self.import_path
        )

    def _sys_path_with_modifications(self, is_completion):
        if self._fixed_sys_path is not None:
            return self._fixed_sys_path

        return (
            # For import completions we don't want to see init paths, but for
            # inference we want to show the user as much as possible.
            # See GH #1446.
            self._inference_state.get_sys_path(add_init_paths=not is_completion)
            + [
                str(p) for p
                in sys_path.check_sys_path_modifications(self._module_context)
            ]
        )

    def follow(self):
        if not self.import_path:
            if self._fixed_sys_path:
                # This is a bit of a special case, that maybe should be
                # revisited. If the project path is wrong or the user uses
                # relative imports the wrong way, we might end up here, where
                # the `fixed_sys_path == project.path` in that case we kind of
                # use the project.path.parent directory as our path. This is
                # usually not a problem, except if imports in other places are
                # using the same names. Example:
                #
                # foo/                       < #1
                #   - setup.py
                #   - foo/                   < #2
                #     - __init__.py
                #     - foo.py               < #3
                #
                # If the top foo is our project folder and somebody uses
                # `from . import foo` in `setup.py`, it will resolve to foo #2,
                # which means that the import for foo.foo is cached as
                # `__init__.py` (#2) and not as `foo.py` (#3). This is usually
                # not an issue, because this case is probably pretty rare, but
                # might be an issue for some people.
                #
                # However for most normal cases where we work with different
                # file names, this code path hits where we basically change the
                # project path to an ancestor of project path.
                from lotas.erdos._vendor.jedi.inference.value.namespace import ImplicitNamespaceValue
                import_path = (os.path.basename(self._fixed_sys_path[0]),)
                ns = ImplicitNamespaceValue(
                    self._inference_state,
                    string_names=import_path,
                    paths=self._fixed_sys_path,
                )
                return ValueSet({ns})
            return NO_VALUES
        if not self._infer_possible:
            return NO_VALUES

        # Check caches first
        from_cache = self._inference_state.stub_module_cache.get(self._str_import_path)
        if from_cache is not None:
            return ValueSet({from_cache})
        from_cache = self._inference_state.module_cache.get(self._str_import_path)
        if from_cache is not None:
            return from_cache

        sys_path = self._sys_path_with_modifications(is_completion=False)

        return import_module_by_names(
            self._inference_state, self.import_path, sys_path, self._module_context
        )

    def _get_module_names(self, search_path=None, in_module=None):
        """
        Get the names of all modules in the search_path. This means file names
        and not names defined in the files.
        """
        if search_path is None:
            sys_path = self._sys_path_with_modifications(is_completion=True)
        else:
            sys_path = search_path
        return list(iter_module_names(
            self._inference_state, self._module_context, sys_path,
            module_cls=ImportName if in_module is None else SubModuleName,
            add_builtin_modules=search_path is None and in_module is None,
        ))

    def completion_names(self, inference_state, only_modules=False):
        """
        :param only_modules: Indicates wheter it's possible to import a
            definition that is not defined in a module.
        """
        if not self._infer_possible:
            return []

        names = []
        if self.import_path:
            # flask
            if self._str_import_path == ('flask', 'ext'):
                # List Flask extensions like ``flask_foo``
                for mod in self._get_module_names():
                    modname = mod.string_name
                    if modname.startswith('flask_'):
                        extname = modname[len('flask_'):]
                        names.append(ImportName(self._module_context, extname))
                # Now the old style: ``flaskext.foo``
                for dir in self._sys_path_with_modifications(is_completion=True):
                    flaskext = os.path.join(dir, 'flaskext')
                    if os.path.isdir(flaskext):
                        names += self._get_module_names([flaskext])

            values = self.follow()
            for value in values:
                # Non-modules are not completable.
                if value.api_type not in ('module', 'namespace'):  # not a module
                    continue
                if not value.is_compiled():
                    # sub_modules_dict is not implemented for compiled modules.
                    names += value.sub_modules_dict().values()

            if not only_modules:
                from lotas.erdos._vendor.jedi.inference.gradual.conversion import convert_values

                both_values = values | convert_values(values)
                for c in both_values:
                    for filter in c.get_filters():
                        names += filter.values()
        else:
            if self.level:
                # We only get here if the level cannot be properly calculated.
                names += self._get_module_names(self._fixed_sys_path)
            else:
                # This is just the list of global imports.
                names += self._get_module_names()
        return names


def import_module_by_names(inference_state, import_names, sys_path=None,
                           module_context=None, prefer_stubs=True):
    if sys_path is None:
        sys_path = inference_state.get_sys_path()

    str_import_names = tuple(
        i.value if isinstance(i, tree.Name) else i
        for i in import_names
    )
    value_set = [None]
    for i, name in enumerate(import_names):
        value_set = ValueSet.from_sets([
            import_module(
                inference_state,
                str_import_names[:i+1],
                parent_module_value,
                sys_path,
                prefer_stubs=prefer_stubs,
            ) for parent_module_value in value_set
        ])
        if not value_set:
            message = 'No module named ' + '.'.join(str_import_names)
            if module_context is not None:
                _add_error(module_context, name, message)
            else:
                debug.warning(message)
            return NO_VALUES
    return value_set


@plugin_manager.decorate()
@import_module_decorator
def import_module(inference_state, import_names, parent_module_value, sys_path):
    """
    This method is very similar to importlib's `_gcd_import`.
    """
    if import_names[0] in settings.auto_import_modules:
        module = _load_builtin_module(inference_state, import_names, sys_path)
        if module is None:
            return NO_VALUES
        return ValueSet([module])

    module_name = '.'.join(import_names)
    if parent_module_value is None:
        # Override the sys.path. It works only good that way.
        # Injecting the path directly into `find_module` did not work.
        file_io_or_ns, is_pkg = inference_state.compiled_subprocess.get_module_info(
            string=import_names[-1],
            full_name=module_name,
            sys_path=sys_path,
            is_global_search=True,
        )
        if is_pkg is None:
            return NO_VALUES
    else:
        paths = parent_module_value.py__path__()
        if paths is None:
            # The module might not be a package.
            return NO_VALUES

        file_io_or_ns, is_pkg = inference_state.compiled_subprocess.get_module_info(
            string=import_names[-1],
            path=paths,
            full_name=module_name,
            is_global_search=False,
        )
        if is_pkg is None:
            return NO_VALUES

    if isinstance(file_io_or_ns, ImplicitNSInfo):
        from lotas.erdos._vendor.jedi.inference.value.namespace import ImplicitNamespaceValue
        module = ImplicitNamespaceValue(
            inference_state,
            string_names=tuple(file_io_or_ns.name.split('.')),
            paths=file_io_or_ns.paths,
        )
    elif file_io_or_ns is None:
        module = _load_builtin_module(inference_state, import_names, sys_path)
        if module is None:
            return NO_VALUES
    else:
        module = _load_python_module(
            inference_state, file_io_or_ns,
            import_names=import_names,
            is_package=is_pkg,
        )

    if parent_module_value is None:
        debug.dbg('global search_module %s: %s', import_names[-1], module)
    else:
        debug.dbg('search_module %s in paths %s: %s', module_name, paths, module)
    return ValueSet([module])


def _load_python_module(inference_state, file_io,
                        import_names=None, is_package=False):
    module_node = inference_state.parse(
        file_io=file_io,
        cache=True,
        diff_cache=settings.fast_parser,
        cache_path=settings.cache_directory,
    )

    from lotas.erdos._vendor.jedi.inference.value import ModuleValue
    return ModuleValue(
        inference_state, module_node,
        file_io=file_io,
        string_names=import_names,
        code_lines=get_cached_code_lines(inference_state.grammar, file_io.path),
        is_package=is_package,
    )


def _load_builtin_module(inference_state, import_names=None, sys_path=None):
    project = inference_state.project
    if sys_path is None:
        sys_path = inference_state.get_sys_path()
    if not project._load_unsafe_extensions:
        safe_paths = project._get_base_sys_path(inference_state)
        sys_path = [p for p in sys_path if p in safe_paths]

    dotted_name = '.'.join(import_names)
    assert dotted_name is not None
    module = compiled.load_module(inference_state, dotted_name=dotted_name, sys_path=sys_path)
    if module is None:
        # The file might raise an ImportError e.g. and therefore not be
        # importable.
        return None
    return module


def load_module_from_path(inference_state, file_io, import_names=None, is_package=None):
    """
    This should pretty much only be used for get_modules_containing_name. It's
    here to ensure that a random path is still properly loaded into the Jedi
    module structure.
    """
    path = Path(file_io.path)
    if import_names is None:
        e_sys_path = inference_state.get_sys_path()
        import_names, is_package = sys_path.transform_path_to_dotted(e_sys_path, path)
    else:
        assert isinstance(is_package, bool)

    is_stub = path.suffix == '.pyi'
    if is_stub:
        folder_io = file_io.get_parent_folder()
        if folder_io.path.endswith('-stubs'):
            folder_io = FolderIO(folder_io.path[:-6])
        if path.name == '__init__.pyi':
            python_file_io = folder_io.get_file_io('__init__.py')
        else:
            python_file_io = folder_io.get_file_io(import_names[-1] + '.py')

        try:
            v = load_module_from_path(
                inference_state, python_file_io,
                import_names, is_package=is_package
            )
            values = ValueSet([v])
        except FileNotFoundError:
            values = NO_VALUES

        return create_stub_module(
            inference_state, inference_state.latest_grammar, values,
            parse_stub_module(inference_state, file_io), file_io, import_names
        )
    else:
        module = _load_python_module(
            inference_state, file_io,
            import_names=import_names,
            is_package=is_package,
        )
        inference_state.module_cache.add(import_names, ValueSet([module]))
        return module


def load_namespace_from_path(inference_state, folder_io):
    import_names, is_package = sys_path.transform_path_to_dotted(
        inference_state.get_sys_path(),
        Path(folder_io.path)
    )
    from lotas.erdos._vendor.jedi.inference.value.namespace import ImplicitNamespaceValue
    return ImplicitNamespaceValue(inference_state, import_names, [folder_io.path])


def follow_error_node_imports_if_possible(context, name):
    error_node = tree.search_ancestor(name, 'error_node')
    if error_node is not None:
        # Get the first command start of a started simple_stmt. The error
        # node is sometimes a small_stmt and sometimes a simple_stmt. Check
        # for ; leaves that start a new statements.
        start_index = 0
        for index, n in enumerate(error_node.children):
            if n.start_pos > name.start_pos:
                break
            if n == ';':
                start_index = index + 1
        nodes = error_node.children[start_index:]
        first_name = nodes[0].get_first_leaf().value

        # Make it possible to infer stuff like `import foo.` or
        # `from foo.bar`.
        if first_name in ('from', 'import'):
            is_import_from = first_name == 'from'
            level, names = helpers.parse_dotted_names(
                nodes,
                is_import_from=is_import_from,
                until_node=name,
            )
            return Importer(
                context.inference_state, names, context.get_root_context(), level).follow()
    return None


def iter_module_names(inference_state, module_context, search_path,
                      module_cls=ImportName, add_builtin_modules=True):
    """
    Get the names of all modules in the search_path. This means file names
    and not names defined in the files.
    """
    # add builtin module names
    if add_builtin_modules:
        for name in inference_state.compiled_subprocess.get_builtin_module_names():
            yield module_cls(module_context, name)

    for name in inference_state.compiled_subprocess.iter_module_names(search_path):
        yield module_cls(module_context, name)
