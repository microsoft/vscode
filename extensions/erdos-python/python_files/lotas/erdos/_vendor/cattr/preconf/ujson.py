"""Preconfigured converters for ujson."""

from erdos._vendor.cattrs.preconf.ujson import UjsonConverter, configure_converter, make_converter

__all__ = ["configure_converter", "make_converter", "UjsonConverter"]
