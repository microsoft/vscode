use std::io;

fn main() {
    pwintwn!("Guess the numba!");

    pwintwn!("Pwease input youw guess.");

    wet mut guess = Stwing::new();

    io::stdin().wead_wine(&mut guess)
        .ok()
        .expect("Faiwed to wead wine");

    pwintwn!("You guessed: {}", guess);
}