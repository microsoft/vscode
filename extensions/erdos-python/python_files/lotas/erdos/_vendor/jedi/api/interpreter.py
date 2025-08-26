"""
TODO Some parts of this module are still not well documented.
"""

from lotas.erdos._vendor.jedi.inference import compiled
from lotas.erdos._vendor.jedi.inference.base_value import ValueSet
from lotas.erdos._vendor.jedi.inference.filters import ParserTreeFilter, MergedFilter
from lotas.erdos._vendor.jedi.inference.names import TreeNameDefinition
from lotas.erdos._vendor.jedi.inference.compiled import mixed
from lotas.erdos._vendor.jedi.inference.compiled.access import create_access_path
from lotas.erdos._vendor.jedi.inference.context import ModuleContext


def _create(inference_state, obj):
    return compiled.create_from_access_path(
        inference_state, create_access_path(inference_state, obj)
    )


class NamespaceObject:
    def __init__(self, dct):
        self.__dict__ = dct


class MixedTreeName(TreeNameDefinition):
    def infer(self):
        """
        In IPython notebook it is typical that some parts of the code that is
        provided was already executed. In that case if something is not properly
        inferred, it should still infer from the variables it already knows.
        """
        inferred = super().infer()
        if not inferred:
            for compiled_value in self.parent_context.mixed_values:
                for f in compiled_value.get_filters():
                    values = ValueSet.from_sets(
                        n.infer() for n in f.get(self.string_name)
                    )
                    if values:
                        return values
        return inferred


class MixedParserTreeFilter(ParserTreeFilter):
    name_class = MixedTreeName


class MixedModuleContext(ModuleContext):
    def __init__(self, tree_module_value, namespaces):
        super().__init__(tree_module_value)
        self.mixed_values = [
            self._get_mixed_object(
                _create(self.inference_state, NamespaceObject(n))
            ) for n in namespaces
        ]

    def _get_mixed_object(self, compiled_value):
        return mixed.MixedObject(
            compiled_value=compiled_value,
            tree_value=self._value
        )

    def get_filters(self, until_position=None, origin_scope=None):
        yield MergedFilter(
            MixedParserTreeFilter(
                parent_context=self,
                until_position=until_position,
                origin_scope=origin_scope
            ),
            self.get_global_filter(),
        )

        for mixed_object in self.mixed_values:
            yield from mixed_object.get_filters(until_position, origin_scope)
