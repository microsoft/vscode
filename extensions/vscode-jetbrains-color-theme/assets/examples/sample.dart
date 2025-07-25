// Null safety and async
Future<String> fetchUser() async {
  try {
    var response = await http.get(url);
    return jsonDecode(response.body)['name'] ?? 'unknown';
  } on TimeoutException catch (e) {
    print('Timeout: $e');
  }
}

mixin Logger on User {
  void log(String message) => print(message);
}

class Employee extends User with Logger {
  final String id;

  Employee(this.id) : super(name: 'New Employee');

  @override
  void log(String message) => super.log('[EMP] $message');
}

var squared = (int x) => x * x;
var numbers = [1, 2, 3].map((n) => n * 2);
