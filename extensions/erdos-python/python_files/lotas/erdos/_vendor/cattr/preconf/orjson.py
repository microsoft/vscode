"""Preconfigured converters for orjson."""

from cattrs.preconf.orjson import OrjsonConverter, configure_converter, make_converter

__all__ = ["configure_converter", "make_converter", "OrjsonConverter"]
