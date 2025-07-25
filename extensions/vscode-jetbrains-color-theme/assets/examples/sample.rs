// Single-line comment
/* Multi-line
   comment */

/// Documentation comment
#[derive(Debug)]
struct Point<T> {
    x: T,
    y: T,
}

impl<T> Point<T> {
    fn new(x: T, y: T) -> Self {
        Point { x, y }
    }
}

async fn fetch_data() -> Result<(), Box<dyn Error>> {
    let response = reqwest::get("url").await?;
    let text = response.text().await?;
    Ok(())
}

fn main() {
    let numbers = vec![1, 2, 3];
    let doubled: Vec<_> = numbers.iter().map(|x| x * 2).collect();
    println!("{:?}", doubled);
}
