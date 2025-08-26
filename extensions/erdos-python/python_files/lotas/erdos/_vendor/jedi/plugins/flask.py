def import_module(callback):
    """
    Handle "magic" Flask extension imports:
    ``flask.ext.foo`` is really ``flask_foo`` or ``flaskext.foo``.
    """
    def wrapper(inference_state, import_names, module_context, *args, **kwargs):
        if len(import_names) == 3 and import_names[:2] == ('flask', 'ext'):
            # New style.
            ipath = ('flask_' + import_names[2]),
            value_set = callback(inference_state, ipath, None, *args, **kwargs)
            if value_set:
                return value_set
            value_set = callback(inference_state, ('flaskext',), None, *args, **kwargs)
            return callback(
                inference_state,
                ('flaskext', import_names[2]),
                next(iter(value_set)),
                *args, **kwargs
            )
        return callback(inference_state, import_names, module_context, *args, **kwargs)
    return wrapper
