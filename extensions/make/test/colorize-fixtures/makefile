all: hello

hello: main.o factorial.o hello.o
    g++ main.o factorial.o hello.o -o hello

main.o: main.cpp
    g++ -c main.cpp

factorial.o: factorial.cpp
    g++ -c factorial.cpp

hello.o: hello.cpp
    g++ -c hello.cpp

clean:
    rm *o hello

define defined
	$(info Checkng existance of $(1))
	$(if ifeq "$(flavor $(1))" "undefined",0,1)
endef

ifeq ($(call defined,TOP_DIR),0)
TOP_DIR must be set before including paths.mk
endif

include $(TOP_DIR)3rdparty.mk

ifeq ($(call defined,CODIT_DIR),0)
CODIT_DIR must be set in $(TOP_DIR)3rdparty.mk
endif