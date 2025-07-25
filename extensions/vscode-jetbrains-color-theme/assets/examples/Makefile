CC = gcc
CFLAGS = -Wall -O2

.PHONY: all clean

all: program

program: main.o utils.o
	$(CC) $(CFLAGS) $^ -o $@

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f *.o program
