from typing import List, NamedTuple

class struct_spwd(NamedTuple):
    sp_namp: str
    sp_pwdp: str
    sp_lstchg: int
    sp_min: int
    sp_max: int
    sp_warn: int
    sp_inact: int
    sp_expire: int
    sp_flag: int

def getspall() -> List[struct_spwd]: ...
def getspnam(name: str) -> struct_spwd: ...
