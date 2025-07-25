// Null safety and coroutines
data class User(val name: String, val age: Int?)

suspend fun fetchUser(id: Int): User? = withContext(Dispatchers.IO) {
    try {
        User("John", 30)
    } catch (e: Exception) {
        null
    }
}

val numbers = listOf(1, 2, 3).filter { it > 1 }
    .mapIndexed { index, value -> value * index }

sealed class Result {
    data class Success(val data: String) : Result()
    object Error : Result()
}

fun <T> T.printSelf() where T : Any {
    println(this.toString())
}
