{
  "variables": {
    "VERDI_HOME": "/home/heyfey/verdi/2022.06", # path to your VERDI_HOME
  },
  "targets": [
    {
      "target_name": "fsdb_reader",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "sources": [ "src/fsdb_reader.cpp" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<(VERDI_HOME)/share/FsdbReader" # path to find ffrAPI.h, fsdbShr.h
      ],
      'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ],
      "ldflags": [
        "-L<(VERDI_HOME)/share/FsdbReader/linux64",
        "-static-libstdc++" # to solve GLIBCXX not found
      ],
      "libraries": [
        # "<(VERDI_HOME)/share/FsdbReader/linux64/libnffr.so",
        # "<(VERDI_HOME)/share/FsdbReader/linux64/libnsys.so",
        "-lnffr",
        "-lnsys"
      ],
    }
  ]
}