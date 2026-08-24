class Item {
private:
	std::string name;
	std::string description;
	int value;

public:
	…
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

	int getDamage() const {…}

	void use() override {…}
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
	…
};
…
