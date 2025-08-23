"""Strategy for using class-specific (un)structuring methods."""

from inspect import signature
from typing import Any, Callable, Optional, Type, TypeVar

from .. import BaseConverter

T = TypeVar("T")


def use_class_methods(
    converter: BaseConverter,
    structure_method_name: Optional[str] = None,
    unstructure_method_name: Optional[str] = None,
) -> None:
    """
    Configure the converter such that dedicated methods are used for (un)structuring
    the instance of a class if such methods are available. The default (un)structuring
    will be applied if such an (un)structuring methods cannot be found.

    :param converter: The `Converter` on which this strategy is applied. You can use
        :class:`cattrs.BaseConverter` or any other derived class.
    :param structure_method_name: Optional string with the name of the class method
        which should be used for structuring. If not provided, no class method will be
        used for structuring.
    :param unstructure_method_name: Optional string with the name of the class method
        which should be used for unstructuring. If not provided, no class method will
        be used for unstructuring.

    If you want to (un)structured nested objects, just append a converter parameter
    to your (un)structuring methods and you will receive the converter there.

    .. versionadded:: 23.2.0
    """

    if structure_method_name:

        def make_class_method_structure(cl: Type[T]) -> Callable[[Any, Type[T]], T]:
            fn = getattr(cl, structure_method_name)
            n_parameters = len(signature(fn).parameters)
            if n_parameters == 1:
                return lambda v, _: fn(v)
            if n_parameters == 2:
                return lambda v, _: fn(v, converter)
            raise TypeError("Provide a class method with one or two arguments.")

        converter.register_structure_hook_factory(
            lambda t: hasattr(t, structure_method_name), make_class_method_structure
        )

    if unstructure_method_name:

        def make_class_method_unstructure(cl: Type[T]) -> Callable[[T], T]:
            fn = getattr(cl, unstructure_method_name)
            n_parameters = len(signature(fn).parameters)
            if n_parameters == 1:
                return fn
            if n_parameters == 2:
                return lambda self_: fn(self_, converter)
            raise TypeError("Provide a method with no or one argument.")

        converter.register_unstructure_hook_factory(
            lambda t: hasattr(t, unstructure_method_name), make_class_method_unstructure
        )
