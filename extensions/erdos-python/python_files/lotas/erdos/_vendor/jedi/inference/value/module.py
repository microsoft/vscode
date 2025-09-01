import os
from pathlib import Path
from typing import Optional

from erdos._vendor.jedi.inference.cache import inference_state_method_cache
from erdos._vendor.jedi.inference.names import AbstractNameDefinition, ModuleName
from erdos._vendor.jedi.inference.filters import GlobalNameFilter, ParserTreeFilter, DictFilter, MergedFilter
from erdos._vendor.jedi.inference import compiled
from erdos._vendor.jedi.inference.base_value import TreeValue
from erdos._vendor.jedi.inference.names import SubModuleName
from erdos._vendor.jedi.inference.helpers import values_from_qualified_names
from erdos._vendor.jedi.inference.compiled import create_simple_object
from erdos._vendor.jedi.inference.base_value import ValueSet
from erdos._vendor.jedi.inference.context import ModuleContext


class _ModuleAttributeName(AbstractNameDefinition):
    """
    For module attributes like __file__, __str__ and so on.
    """
    api_type = 'instance'

    def __init__(self, parent_module, string_name, string_value=None):
        self.parent_context = parent_module
        self.string_name = string_name
        self._string_value = string_value

    def infer(self):
        if self._string_value is not None:
            s = self._string_value
            return ValueSet([
                create_simple_object(self.parent_context.inference_state, s)
            ])
        return compiled.get_string_value_set(self.parent_context.inference_state)


class SubModuleDictMixin:
    @inference_state_method_cache()
    def sub_modules_dict(self):
        """
        Lists modules in the directory of this module (if this module is a
        package).
        """
        names = {}
        if self.is_package():
            mods = self.inference_state.compiled_subprocess.iter_module_names(
                self.py__path__()
            )
            for name in mods:
                # It's obviously a relative import to the current module.
                names[name] = SubModuleName(self.as_context(), name)

        # In the case of an import like `from x.` we don't need to
        # add all the variables, this is only about submodules.
        return names


class ModuleMixin(SubModuleDictMixin):
    _module_name_class = ModuleName

    def get_filters(self, origin_scope=None):
        yield MergedFilter(
            ParserTreeFilter(
                parent_context=self.as_context(),
                origin_scope=origin_scope
            ),
            GlobalNameFilter(self.as_context()),
        )
        yield DictFilter(self.sub_modules_dict())
        yield DictFilter(self._module_attributes_dict())
        yield from self.iter_star_filters()

    def py__class__(self):
        c, = values_from_qualified_names(self.inference_state, 'types', 'ModuleType')
        return c

    def is_module(self):
        return True

    def is_stub(self):
        return False

    @property  # type: ignore[misc]
    @inference_state_method_cache()
    def name(self):
        return self._module_name_class(self, self.string_names[-1])

    @inference_state_method_cache()
    def _module_attributes_dict(self):
        names = ['__package__', '__doc__', '__name__']
        # All the additional module attributes are strings.
        dct = dict((n, _ModuleAttributeName(self, n)) for n in names)
        path = self.py__file__()
        if path is not None:
            dct['__file__'] = _ModuleAttributeName(self, '__file__', str(path))
        return dct

    def iter_star_filters(self):
        for star_module in self.star_imports():
            f = next(star_module.get_filters(), None)
            assert f is not None
            yield f

    # I'm not sure if the star import cache is really that effective anymore
    # with all the other really fast import caches. Recheck. Also we would need
    # to push the star imports into InferenceState.module_cache, if we reenable this.
    @inference_state_method_cache([])
    def star_imports(self):
        from erdos._vendor.jedi.inference.imports import Importer

        modules = []
        module_context = self.as_context()
        for i in self.tree_node.iter_imports():
            if i.is_star_import():
                new = Importer(
                    self.inference_state,
                    import_path=i.get_paths()[-1],
                    module_context=module_context,
                    level=i.level
                ).follow()

                for module in new:
                    if isinstance(module, ModuleValue):
                        modules += module.star_imports()
                modules += new
        return modules

    def get_qualified_names(self):
        """
        A module doesn't have a qualified name, but it's important to note that
        it's reachable and not `None`. With this information we can add
        qualified names on top for all value children.
        """
        return ()


class ModuleValue(ModuleMixin, TreeValue):
    api_type = 'module'

    def __init__(self, inference_state, module_node, code_lines, file_io=None,
                 string_names=None, is_package=False):
        super().__init__(
            inference_state,
            parent_context=None,
            tree_node=module_node
        )
        self.file_io = file_io
        if file_io is None:
            self._path: Optional[Path] = None
        else:
            self._path = file_io.path
        self.string_names = string_names  # Optional[Tuple[str, ...]]
        self.code_lines = code_lines
        self._is_package = is_package

    def is_stub(self):
        if self._path is not None and self._path.suffix == '.pyi':
            # Currently this is the way how we identify stubs when e.g. goto is
            # used in them. This could be changed if stubs would be identified
            # sooner and used as StubModuleValue.
            return True
        return super().is_stub()

    def py__name__(self):
        if self.string_names is None:
            return None
        return '.'.join(self.string_names)

    def py__file__(self) -> Optional[Path]:
        """
        In contrast to Python's __file__ can be None.
        """
        if self._path is None:
            return None

        return self._path.absolute()

    def is_package(self):
        return self._is_package

    def py__package__(self):
        if self.string_names is None:
            return []

        if self._is_package:
            return self.string_names
        return self.string_names[:-1]

    def py__path__(self):
        """
        In case of a package, this returns Python's __path__ attribute, which
        is a list of paths (strings).
        Returns None if the module is not a package.
        """
        if not self._is_package:
            return None

        # A namespace package is typically auto generated and ~10 lines long.
        first_few_lines = ''.join(self.code_lines[:50])
        # these are strings that need to be used for namespace packages,
        # the first one is ``pkgutil``, the second ``pkg_resources``.
        options = ('declare_namespace(__name__)', 'extend_path(__path__')
        if options[0] in first_few_lines or options[1] in first_few_lines:
            # It is a namespace, now try to find the rest of the
            # modules on sys_path or whatever the search_path is.
            paths = set()
            for s in self.inference_state.get_sys_path():
                other = os.path.join(s, self.name.string_name)
                if os.path.isdir(other):
                    paths.add(other)
            if paths:
                return list(paths)
            # Nested namespace packages will not be supported. Nobody ever
            # asked for it and in Python 3 they are there without using all the
            # crap above.

        # Default to the of this file.
        file = self.py__file__()
        assert file is not None  # Shouldn't be a package in the first place.
        return [os.path.dirname(file)]

    def _as_context(self):
        return ModuleContext(self)

    def __repr__(self):
        return "<%s: %s@%s-%s is_stub=%s>" % (
            self.__class__.__name__, self.py__name__(),
            self.tree_node.start_pos[0], self.tree_node.end_pos[0],
            self.is_stub()
        )
