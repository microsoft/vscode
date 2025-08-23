from functools import wraps


class _PluginManager:
    def __init__(self):
        self._registered_plugins = []
        self._cached_base_callbacks = {}
        self._built_functions = {}

    def register(self, *plugins):
        """
        Makes it possible to register your plugin.
        """
        self._registered_plugins.extend(plugins)
        self._build_functions()

    def decorate(self, name=None):
        def decorator(callback):
            @wraps(callback)
            def wrapper(*args, **kwargs):
                return built_functions[public_name](*args, **kwargs)

            public_name = name or callback.__name__

            assert public_name not in self._built_functions
            built_functions = self._built_functions
            built_functions[public_name] = callback
            self._cached_base_callbacks[public_name] = callback

            return wrapper

        return decorator

    def _build_functions(self):
        for name, callback in self._cached_base_callbacks.items():
            for plugin in reversed(self._registered_plugins):
                # Need to reverse so the first plugin is run first.
                try:
                    func = getattr(plugin, name)
                except AttributeError:
                    pass
                else:
                    callback = func(callback)
            self._built_functions[name] = callback


plugin_manager = _PluginManager()
