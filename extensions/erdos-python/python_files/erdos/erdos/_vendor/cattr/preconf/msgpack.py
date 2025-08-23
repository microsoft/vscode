"""Preconfigured converters for msgpack."""

from erdos.erdos._vendor.cattrs.preconf.msgpack import MsgpackConverter, configure_converter, make_converter

__all__ = ["configure_converter", "make_converter", "MsgpackConverter"]
