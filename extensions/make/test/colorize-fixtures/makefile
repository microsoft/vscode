.PHONY: all
all: hello

.PHONY: hello
hello: main.o factorial.o \
       hello.o # This is a long \
                 comment
	g++ main.o factorial.o hello.o -o hello

# There are a building steps \
	below. And the tab is at the beginning of this line.

main.o: main.cpp
	g++ -c main.cpp

factorial.o: factorial.cpp
	g++ -c factorial.cpp

hello.o: hello.cpp \
					$(Coloring with tabs at the beginning of line of recipe)
	g++ -c hello.cpp $(fake_variable)

.PHONY: clean
clean:
	rm *o hello

define defined
  $(info Checking existance of $(1) $(flavor $(1)))
  $(if $(filter undefined,$(flavor $(1))),0,1)
endef

ifeq ($(strip $(call defined,TOP_DIR)),0)
  $(info TOP_DIR must be set before including paths.mk)
endif

-include $(TOP_DIR)3rdparty.mk

ifeq ($(strip $(call defined,CODIT_DIR)),0)
  $(info CODIT_DIR must be set in $(TOP_DIR)3rdparty.mk)
endif