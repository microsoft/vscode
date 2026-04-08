#include <iostream>
#include <string>
#include <vector>
#include <memory>
#include <random>
#include <algorithm>

/**
 * Base Item class for game objects
 */
class Item {
private:
	std::string name;
	std::string description;
	int value;

public:
	Item(const std::string& itemName, const std::string& itemDesc, int itemValue)
		: name(itemName), description(itemDesc), value(itemValue) {}

	virtual ~Item() = default;

	std::string getName() const { return name; }
	std::string getDescription() const { return description; }
	int getValue() const { return value; }

	virtual void use() {
		std::cout << "Using " << name << ": " << description << std::endl;
	}
};

/**
 * Weapon class derived from Item
 */
class Weapon : public Item {
private:
	int damage;

public:
	Weapon(const std::string& name, const std::string& desc, int value, int weaponDamage)
		: Item(name, desc, value), damage(weaponDamage) {}

	int getDamage() const { return damage; }

	void use() override {
		std::cout << "Wielding " << getName() << " that deals " << damage << " damage!" << std::endl;
	}
};

/**
 * Character class for player and NPCs
 */
class Character {
private:
	std::string name;
	int health;
	int maxHealth;
	std::vector<std::shared_ptr<Item>> inventory;
	std::shared_ptr<Weapon> equippedWeapon;

public:
	Character(const std::string& charName, int charHealth)
		: name(charName), health(charHealth), maxHealth(charHealth), equippedWeapon(nullptr) {}

	virtual ~Character() = default;

	std::string getName() const { return name; }
	int getHealth() const { return health; }
	int getMaxHealth() const { return maxHealth; }

	void takeDamage(int amount) {
		health = std::max(0, health - amount);
		std::cout << name << " takes " << amount << " damage. Health: " << health << "/" << maxHealth << std::endl;
	}

	void heal(int amount) {
		health = std::min(maxHealth, health + amount);
		std::cout << name << " heals " << amount << " points. Health: " << health << "/" << maxHealth << std::endl;
	}

	void addItem(std::shared_ptr<Item> item) {
		inventory.push_back(item);
		std::cout << name << " received " << item->getName() << std::endl;
	}

	void equipWeapon(const std::string& weaponName) {
		for (const auto& item : inventory) {
			auto weapon = std::dynamic_pointer_cast<Weapon>(item);
			if (weapon && weapon->getName() == weaponName) {
				equippedWeapon = weapon;
				std::cout << name << " equipped " << weaponName << std::endl;
				return;
			}
		}
		std::cout << "No weapon named " << weaponName << " in inventory!" << std::endl;
	}

	void attack(Character& target) {
		if (!equippedWeapon) {
			std::cout << name << " has no weapon equipped!" << std::endl;
			return;
		}

		std::cout << name << " attacks " << target.getName() << " with " << equippedWeapon->getName() << std::endl;
		target.takeDamage(equippedWeapon->getDamage());
	}

	void showInventory() {
		std::cout << name << "'s inventory:" << std::endl;
		if (inventory.empty()) {
			std::cout << "  Empty" << std::endl;
			return;
		}

		for (const auto& item : inventory) {
			std::cout << "  " << item->getName() << " - " << item->getDescription() << std::endl;
		}
	}
};

/**
 * Game class to manage game state
 */
class Game {
private:
	std::shared_ptr<Character> player;
	std::vector<std::shared_ptr<Character>> enemies;
	bool gameRunning;

public:
	Game() : gameRunning(false) {}

	void initialize() {
		// Create player
		player = std::make_shared<Character>("Hero", 100);

		// Add some starter items
		player->addItem(std::make_shared<Weapon>("Rusty Sword", "An old but reliable blade", 5, 10));
		player->addItem(std::make_shared<Item>("Health Potion", "Restores 20 health", 15));

		// Create an enemy
		enemies.push_back(std::make_shared<Character>("Goblin", 30));

		gameRunning = true;
		std::cout << "Game initialized! Welcome, " << player->getName() << "!" << std::endl;
	}

	void run() {
		if (!gameRunning) {
			initialize();
		}

		// Simple gameplay demonstration
		player->showInventory();
		player->equipWeapon("Rusty Sword");

		std::cout << "\nA " << enemies[0]->getName() << " appears!" << std::endl;
		player->attack(*enemies[0]);

		if (enemies[0]->getHealth() > 0) {
			std::cout << enemies[0]->getName() << " attacks back!" << std::endl;
			// Simulating enemy attack with fixed damage
			player->takeDamage(5);
		} else {
			std::cout << enemies[0]->getName() << " was defeated!" << std::endl;
			enemies.erase(enemies.begin());
		}

		std::cout << "Game demonstration complete." << std::endl;
	}
};

/**
 * Main function
 */
int main() {
	std::cout << "=== Text Adventure Game ===" << std::endl;

	Game game;
	game.run();

	return 0;
}
