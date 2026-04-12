// classes example
#include <iostream>
using namespace std;

#define EXTERN_C extern "C"

class Rectangle {
    int width, height;
  public:
    void set_values (int,int);
    int area() {return width*height;}
};

void Rectangle::set_values (int x, int y) {
  width = x;
  height = y;
}

long double operator "" _w(long double);
#define MY_MACRO(a, b)

int main () {
  1.2_w; // calls operator "" _w(1.2L)
  asm("movl %a %b");
  MY_MACRO(1, 2);
  Rectangle rect;
  rect.set_values (3,4);
  cout << "area: " << rect.area();
  Task<ANY_OUTPUT_TYPE, ANY_INPUT_TYPE>::links_to;
  int t = 2;
  if (t > 0) puts("\n*************************************************");
  return 0;
}
