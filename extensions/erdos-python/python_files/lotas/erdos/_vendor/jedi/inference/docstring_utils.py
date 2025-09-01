from erdos._vendor.jedi.inference.value import ModuleValue
from erdos._vendor.jedi.inference.context import ModuleContext


class DocstringModule(ModuleValue):
    def __init__(self, in_module_context, **kwargs):
        super().__init__(**kwargs)
        self._in_module_context = in_module_context

    def _as_context(self):
        return DocstringModuleContext(self, self._in_module_context)


class DocstringModuleContext(ModuleContext):
    def __init__(self, module_value, in_module_context):
        super().__init__(module_value)
        self._in_module_context = in_module_context

    def get_filters(self, origin_scope=None, until_position=None):
        yield from super().get_filters(until_position=until_position)
        yield from self._in_module_context.get_filters()
