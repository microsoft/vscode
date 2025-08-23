import SimpleHTTPServer
from typing import List

class CGIHTTPRequestHandler(SimpleHTTPServer.SimpleHTTPRequestHandler):
    cgi_directories: List[str]
    def do_POST(self) -> None: ...
