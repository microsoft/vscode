"""Preconfigured converters for ujson."""

from cattrs.preconf.ujson import UjsonConverter, configure_converter, make_converter

__all__ = ["configure_converter", "make_converter", "UjsonConverter"]
