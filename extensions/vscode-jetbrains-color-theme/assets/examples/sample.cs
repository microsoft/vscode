// Single-line comment
/* Multi-line
   comment */
/// XML documentation

namespace MyApp {
    [Serializable]
    public class Person : IDisposable {
        public string Name { get; set; } = "John";
        private int _age;

        public async Task<int> GetDataAsync() {
            using var client = new HttpClient();
            var response = await client.GetAsync("url");
            return (int)response.StatusCode;
        }

        ~Person() {
            Dispose(false);
        }
    }

    delegate void MyDelegate(string msg);

    var query = from num in numbers
                where num > 10
                select num * 2;
}
