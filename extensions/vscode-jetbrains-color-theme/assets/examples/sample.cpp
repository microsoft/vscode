// Single-line comment
/* Multi-line
   comment */
   #define MACRO 10

   #include <iostream>
   using namespace std;
   
   template<typename T>
   class MyClass : public ParentClass {
   private:
       T* data;

   public:
       MyClass(T value) noexcept : data(new T(value)) {}

       friend ostream& operator<<(ostream& os, const MyClass& obj);
   };

   auto lambda = [](auto x, auto y) { return x + y; };

   int main() {
       vector<int> numbers = {1, 2, 3};
       for (auto& num : numbers) {
           cout << num << endl;
       }
       return 0;
   }
