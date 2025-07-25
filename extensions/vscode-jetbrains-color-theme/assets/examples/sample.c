#include <stdio.h>
#define PI 3.1415

typedef struct {
  int x;
  char* name;
} Point;

enum Status { OK, ERROR };

void swap(int* a, int* b) {
  int temp = *a;
  *a = *b;
  *b = temp;
}

int main() {
  int arr[] = {1, 2, [4]=5};
  Point p = { .x = 10, .name = "test" };
  int (*func_ptr)(int) = &some_function;

  #pragma omp parallel
  {
    printf("Hello from thread\n");
  }

  return EXIT_SUCCESS;
}
