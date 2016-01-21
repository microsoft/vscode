"""
:mod:`jedi.evaluate.imports` is here to resolve import statements and return
the modules/classes/functions/whatever, which they stand for. However there's
not any actual importing done. This module is about finding modules in the
filesystem. This can be quite tricky sometimes, because Python imports are not
always that simple.

This module uses imp for python up to 3.2 and importlib for python 3.3 on; the
correct implementation is delegated to _compatibility.

This module also supports import autocompletion, which means to complete
statements like ``from datetim`` (curser at the end would return ``datetime``).
"""
import imp
import os
import pkgutil
import sys
from itertools import chain

from jedi._compatibility import find_module, unicode
from jedi import common
from jedi import debug
from jedi import cache
from jedi.parser import fast
from jedi.parser import tree
from jedi.evaluate import sys_path
from jedi.evaluate import helpers
from jedi import settings
from jedi.common import source_to_unicode
from jedi.evaluate import compiled
from jedi.evaluate import analysis
from jedi.evaluate.cache import memoize_default, NO_DEFAULT


def completion_names(evaluator, imp, pos):
    name = imp.name_for_position(pos)
    module = evaluator.wrap(imp.get_parent_until())
    if name is None:
        level = 0
        for node in imp.children:
            if node.end_pos <= pos:
                if node in ('.', '...'):
                    level += len(node.value)
        import_path = []
    else:
        # Completion on an existing name.

        # The import path needs to be reduced by one, because we're completing.
        import_path = imp.path_for_name(name)[:-1]
        level = imp.level

    importer = Importer(evaluator, tuple(import_path), module, level)
    if isinstance(imp, tree.ImportFrom):
        c = imp.children
        only_modules = c[c.index('import')].start_pos >= pos
    else:
        only_modules = True
    return importer.completion_names(evaluator, only_modules)


class ImportWrapper(tree.Base):
    def __init__(self, evaluator, name):
        self._evaluator = evaluator
        self._name = name

        self._import = name.get_parent_until(tree.Import)
        self.import_path = self._import.path_for_name(name)

    @memoize_default()
    def follow(self, is_goto=False):
        if self._evaluator.recursion_detector.push_stmt(self._import):
            # check recursion
            return []

        try:
            module = self._evaluator.wrap(self._import.get_parent_until())
            import_path = self._import.path_for_name(self._name)
            from_import_name = None
            try:
                from_names = self._import.get_from_names()
            except AttributeError:
                # Is an import_name
                pass
            else:
                if len(from_names) + 1 == len(import_path):
                    # We have to fetch the from_names part first and then check
                    # if from_names exists in the modules.
                    from_import_name = import_path[-1]
                    import_path = from_names

            importer = Importer(self._evaluator, tuple(import_path),
                                module, self._import.level)

            types = importer.follow()

            #if self._import.is_nested() and not self.nested_resolve:
            #    scopes = [NestedImportModule(module, self._import)]

            if from_import_name is not None:
                types = list(chain.from_iterable(
                    self._evaluator.find_types(t, unicode(from_import_name),
                                               is_goto=is_goto)
                    for t in types))

                if not types:
                    path = import_path + [from_import_name]
                    importer = Importer(self._evaluator, tuple(path),
                                        module, self._import.level)
                    types = importer.follow()
                    # goto only accepts `Name`
                    if is_goto:
                        types = [s.name for s in types]
            else:
                # goto only accepts `Name`
                if is_goto:
                    types = [s.name for s in types]

            debug.dbg('after import: %s', types)
        finally:
            self._evaluator.recursion_detector.pop_stmt()
        return types


class NestedImportModule(tree.Module):
    """
    TODO while there's no use case for nested import module right now, we might
        be able to use them for static analysis checks later on.
    """
    def __init__(self, module, nested_import):
        self._module = module
        self._nested_import = nested_import

    def _get_nested_import_name(self):
        """
        Generates an Import statement, that can be used to fake nested imports.
        """
        i = self._nested_import
        # This is not an existing Import statement. Therefore, set position to
        # 0 (0 is not a valid line number).
        zero = (0, 0)
        names = [unicode(name) for name in i.namespace_names[1:]]
        name = helpers.FakeName(names, self._nested_import)
        new = tree.Import(i._sub_module, zero, zero, name)
        new.parent = self._module
        debug.dbg('Generated a nested import: %s', new)
        return helpers.FakeName(str(i.namespace_names[1]), new)

    def __getattr__(self, name):
        return getattr(self._module, name)

    def __repr__(self):
        return "<%s: %s of %s>" % (self.__class__.__name__, self._module,
                                   self._nested_import)


def _add_error(evaluator, name, message=None):
    if hasattr(name, 'parent'):
        # Should be a name, not a string!
        analysis.add(evaluator, 'import-error', name, message)


def get_init_path(directory_path):
    """
    The __init__ file can be searched in a directory. If found return it, else
    None.
    """
    for suffix, _, _ in imp.get_suffixes():
        path = os.path.join(directory_path, '__init__' + suffix)
        if os.path.exists(path):
            return path
    return None


class Importer(object):
    def __init__(self, evaluator, import_path, module, level=0):
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
        debug.speed('import %s' % (import_path,))
        self._evaluator = evaluator
        self.level = level
        self.module = module
        try:
            self.file_path = module.py__file__()
        except AttributeError:
            # Can be None for certain compiled modules like 'builtins'.
            self.file_path = None

        if level:
            base = module.py__package__().split('.')
            if base == ['']:
                base = []
            if level > len(base):
                path = module.py__file__()
                import_path = list(import_path)
                for i in range(level):
                    path = os.path.dirname(path)
                dir_name = os.path.basename(path)
                # This is not the proper way to do relative imports. However, since
                # Jedi cannot be sure about the entry point, we just calculate an
                # absolute path here.
                if dir_name:
                    import_path.insert(0, dir_name)
                else:
                    _add_error(self._evaluator, import_path[-1])
                    import_path = []
                    # TODO add import error.
                    debug.warning('Attempted relative import beyond top-level package.')
            else:
                # Here we basically rewrite the level to 0.
                import_path = tuple(base) + import_path
        self.import_path = import_path

    @property
    def str_import_path(self):
        """Returns the import path as pure strings instead of `Name`."""
        return tuple(str(name) for name in self.import_path)

    @memoize_default()
    def sys_path_with_modifications(self):
        in_path = []
        sys_path_mod = list(sys_path.sys_path_with_modifications(self._evaluator, self.module))
        if self.file_path is not None:
            # If you edit e.g. gunicorn, there will be imports like this:
            # `from gunicorn import something`. But gunicorn is not in the
            # sys.path. Therefore look if gunicorn is a parent directory, #56.
            if self.import_path:  # TODO is this check really needed?
                for path in sys_path.traverse_parents(self.file_path):
                    if os.path.basename(path) == self.str_import_path[0]:
                        in_path.append(os.path.dirname(path))

            # Since we know nothing about the call location of the sys.path,
            # it's a possibility that the current directory is the origin of
            # the Python execution.
            sys_path_mod.insert(0, os.path.dirname(self.file_path))

        return in_path + sys_path_mod

    @memoize_default(NO_DEFAULT)
    def follow(self):
        if not self.import_path:
            return []
        return self._do_import(self.import_path, self.sys_path_with_modifications())

    def _do_import(self, import_path, sys_path):
        """
        This method is very similar to importlib's `_gcd_import`.
        """
        import_parts = [str(i) for i in import_path]

        # Handle "magic" Flask extension imports:
        # ``flask.ext.foo`` is really ``flask_foo`` or ``flaskext.foo``.
        if len(import_path) > 2 and import_parts[:2] == ['flask', 'ext']:
            # New style.
            ipath = ('flask_' + str(import_parts[2]),) + import_path[3:]
            modules = self._do_import(ipath, sys_path)
            if modules:
                return modules
            else:
                # Old style
                return self._do_import(('flaskext',) + import_path[2:], sys_path)

        module_name = '.'.join(import_parts)
        try:
            return [self._evaluator.modules[module_name]]
        except KeyError:
            pass

        if len(import_path) > 1:
            # This is a recursive way of importing that works great with
            # the module cache.
            bases = self._do_import(import_path[:-1], sys_path)
            if not bases:
                return []
            # We can take the first element, because only the os special
            # case yields multiple modules, which is not important for
            # further imports.
            base = bases[0]

            # This is a huge exception, we follow a nested import
            # ``os.path``, because it's a very important one in Python
            # that is being achieved by messing with ``sys.modules`` in
            # ``os``.
            if [str(i) for i in import_path] == ['os', 'path']:
                return self._evaluator.find_types(base, 'path')

            try:
                # It's possible that by giving it always the sys path (and not
                # the __path__ attribute of the parent, we get wrong results
                # and nested namespace packages don't work.  But I'm not sure.
                paths = base.py__path__(sys_path)
            except AttributeError:
                # The module is not a package.
                _add_error(self._evaluator, import_path[-1])
                return []
            else:
                debug.dbg('search_module %s in paths %s', module_name, paths)
                for path in paths:
                    # At the moment we are only using one path. So this is
                    # not important to be correct.
                    try:
                        module_file, module_path, is_pkg = \
                            find_module(import_parts[-1], [path])
                        break
                    except ImportError:
                        module_path = None
                if module_path is None:
                    _add_error(self._evaluator, import_path[-1])
                    return []
        else:
            try:
                debug.dbg('search_module %s in %s', import_parts[-1], self.file_path)
                # Override the sys.path. It works only good that way.
                # Injecting the path directly into `find_module` did not work.
                sys.path, temp = sys_path, sys.path
                try:
                    module_file, module_path, is_pkg = \
                        find_module(import_parts[-1])
                finally:
                    sys.path = temp
            except ImportError:
                # The module is not a package.
                _add_error(self._evaluator, import_path[-1])
                return []

        source = None
        if is_pkg:
            # In this case, we don't have a file yet. Search for the
            # __init__ file.
            module_path = get_init_path(module_path)
        elif module_file:
            source = module_file.read()
            module_file.close()

        if module_file is None and not module_path.endswith('.py'):
            module = compiled.load_module(module_path)
        else:
            module = _load_module(self._evaluator, module_path, source, sys_path)

        self._evaluator.modules[module_name] = module
        return [module]

    def _generate_name(self, name):
        return helpers.FakeName(name, parent=self.module)

    def _get_module_names(self, search_path=None):
        """
        Get the names of all modules in the search_path. This means file names
        and not names defined in the files.
        """

        names = []
        # add builtin module names
        if search_path is None:
            names += [self._generate_name(name) for name in sys.builtin_module_names]

        if search_path is None:
            search_path = self.sys_path_with_modifications()
        for module_loader, name, is_pkg in pkgutil.iter_modules(search_path):
            names.append(self._generate_name(name))
        return names

    def completion_names(self, evaluator, only_modules=False):
        """
        :param only_modules: Indicates wheter it's possible to import a
            definition that is not defined in a module.
        """
        from jedi.evaluate import finder
        names = []
        if self.import_path:
            # flask
            if self.str_import_path == ('flask', 'ext'):
                # List Flask extensions like ``flask_foo``
                for mod in self._get_module_names():
                    modname = str(mod)
                    if modname.startswith('flask_'):
                        extname = modname[len('flask_'):]
                        names.append(self._generate_name(extname))
                # Now the old style: ``flaskext.foo``
                for dir in self.sys_path_with_modifications():
                    flaskext = os.path.join(dir, 'flaskext')
                    if os.path.isdir(flaskext):
                        names += self._get_module_names([flaskext])

            for scope in self.follow():
                # Non-modules are not completable.
                if not scope.type == 'file_input':  # not a module
                    continue

                # namespace packages
                if isinstance(scope, tree.Module) and scope.path.endswith('__init__.py'):
                    paths = scope.py__path__(self.sys_path_with_modifications())
                    names += self._get_module_names(paths)

                if only_modules:
                    # In the case of an import like `from x.` we don't need to
                    # add all the variables.
                    if ('os',) == self.str_import_path and not self.level:
                        # os.path is a hardcoded exception, because it's a
                        # ``sys.modules`` modification.
                        names.append(self._generate_name('path'))

                    continue

                for names_dict in scope.names_dicts(search_global=False):
                    _names = list(chain.from_iterable(names_dict.values()))
                    if not _names:
                        continue
                    _names = finder.filter_definition_names(_names, scope)
                    names += _names
        else:
            # Empty import path=completion after import
            if not self.level:
                names += self._get_module_names()

            if self.file_path is not None:
                path = os.path.abspath(self.file_path)
                for i in range(self.level - 1):
                    path = os.path.dirname(path)
                names += self._get_module_names([path])

        return names


def _load_module(evaluator, path=None, source=None, sys_path=None):
    def load(source):
        dotted_path = path and compiled.dotted_from_fs_path(path, sys_path)
        if path is not None and path.endswith('.py') \
                and not dotted_path in settings.auto_import_modules:
            if source is None:
                with open(path, 'rb') as f:
                    source = f.read()
        else:
            return compiled.load_module(path)
        p = path
        p = fast.FastParser(evaluator.grammar, common.source_to_unicode(source), p)
        cache.save_parser(path, p)
        return p.module

    cached = cache.load_parser(path)
    module = load(source) if cached is None else cached.module
    module = evaluator.wrap(module)
    return module


def add_module(evaluator, module_name, module):
    if '.' not in module_name:
        # We cannot add paths with dots, because that would collide with
        # the sepatator dots for nested packages. Therefore we return
        # `__main__` in ModuleWrapper.py__name__(), which is similar to
        # Python behavior.
        evaluator.modules[module_name] = module


def get_modules_containing_name(evaluator, mods, name):
    """
    Search a name in the directories of modules.
    """
    def check_python_file(path):
        try:
            return cache.parser_cache[path].parser.module
        except KeyError:
            try:
                return check_fs(path)
            except IOError:
                return None

    def check_fs(path):
        with open(path, 'rb') as f:
            source = source_to_unicode(f.read())
            if name in source:
                module_name = os.path.basename(path)[:-3]  # Remove `.py`.
                module = _load_module(evaluator, path, source)
                add_module(evaluator, module_name, module)
                return module

    # skip non python modules
    mods = set(m for m in mods if not isinstance(m, compiled.CompiledObject))
    mod_paths = set()
    for m in mods:
        mod_paths.add(m.path)
        yield m

    if settings.dynamic_params_for_other_modules:
        paths = set(settings.additional_dynamic_modules)
        for p in mod_paths:
            if p is not None:
                d = os.path.dirname(p)
                for entry in os.listdir(d):
                    if entry not in mod_paths:
                        if entry.endswith('.py'):
                            paths.add(d + os.path.sep + entry)

        for p in sorted(paths):
            # make testing easier, sort it - same results on every interpreter
            c = check_python_file(p)
            if c is not None and c not in mods and not isinstance(c, compiled.CompiledObject):
                yield c
