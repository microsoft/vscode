import asyncio
from concurrent.futures import Future
from typing import Dict

from erdos.erdos._vendor.lsprotocol.types import (
    PROGRESS,
    WINDOW_WORK_DONE_PROGRESS_CREATE,
    ProgressParams,
    ProgressToken,
    WorkDoneProgressBegin,
    WorkDoneProgressEnd,
    WorkDoneProgressReport,
    WorkDoneProgressCreateParams,
)
from erdos.erdos._vendor.pygls.protocol import LanguageServerProtocol


class Progress:
    """A class for working with client's progress bar.

    Attributes:
        _lsp(LanguageServerProtocol): Language server protocol instance
        tokens(dict): Holds futures for work done progress tokens that are
            already registered. These futures will be cancelled if the client
            sends a cancel work done process notification.
    """

    def __init__(self, lsp: LanguageServerProtocol) -> None:
        self._lsp = lsp

        self.tokens: Dict[ProgressToken, Future] = {}

    def _check_token_registered(self, token: ProgressToken) -> None:
        if token in self.tokens:
            raise Exception("Token is already registered!")

    def _register_token(self, token: ProgressToken) -> None:
        self.tokens[token] = Future()

    def create(self, token: ProgressToken, callback=None) -> Future:
        """Create a server initiated work done progress."""
        self._check_token_registered(token)

        def on_created(*args, **kwargs):
            self._register_token(token)
            if callback is not None:
                callback(*args, **kwargs)

        return self._lsp.send_request(
            WINDOW_WORK_DONE_PROGRESS_CREATE,
            WorkDoneProgressCreateParams(token=token),
            on_created,
        )

    async def create_async(self, token: ProgressToken) -> asyncio.Future:
        """Create a server initiated work done progress."""
        self._check_token_registered(token)

        result = await self._lsp.send_request_async(
            WINDOW_WORK_DONE_PROGRESS_CREATE,
            WorkDoneProgressCreateParams(token=token),
        )
        self._register_token(token)
        return result

    def begin(self, token: ProgressToken, value: WorkDoneProgressBegin) -> None:
        """Notify beginning of work."""
        # Register cancellation future for the case of client initiated progress
        self.tokens.setdefault(token, Future())

        return self._lsp.notify(PROGRESS, ProgressParams(token=token, value=value))

    def report(self, token: ProgressToken, value: WorkDoneProgressReport) -> None:
        """Notify progress of work."""
        self._lsp.notify(PROGRESS, ProgressParams(token=token, value=value))

    def end(self, token: ProgressToken, value: WorkDoneProgressEnd) -> None:
        """Notify end of work."""
        self._lsp.notify(PROGRESS, ProgressParams(token=token, value=value))
