
import "dotenv/config";
import mongoose from "mongoose";

import Restaurant from "./models/Restaurant.js";
import MenuItem from "./models/MenuItem.js";

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");

    const sampleRestaurantNames = [
      "Spice Garden",
      "Pizza Corner",
      "Burger House",
    ];

    // Remove only these sample restaurants and their menu items.
    // Run this script only against your development database.
    const existingRestaurants = await Restaurant.find({
      name: { $in: sampleRestaurantNames },
    }).select("_id");

    const existingIds = existingRestaurants.map(
      (restaurant) => restaurant._id
    );

    await MenuItem.deleteMany({
      restaurant: { $in: existingIds },
    });

    await Restaurant.deleteMany({
      name: { $in: sampleRestaurantNames },
    });

    const restaurants = await Restaurant.insertMany([
      {
        name: "Spice Garden",
        description: "Indian favourites made fresh.",
        cuisine: ["Indian", "North Indian"],
        address: "Main Market, Kolkata",
        deliveryTime: "25–35 min",
        isOpen: true,
        isActive: true,
      },
      {
        name: "Pizza Corner",
        description: "Pizza, pasta, and more.",
        cuisine: ["Italian", "Pizza"],
        address: "Park Street, Kolkata",
        deliveryTime: "30–40 min",
        isOpen: true,
        isActive: true,
      },
      {
        name: "Burger House",
        description: "Juicy burgers, crispy fries, and tasty combos.",
        cuisine: ["American", "Burgers", "Fast Food"],
        address: "Salt Lake, Kolkata",
        deliveryTime: "20–30 min",
        isOpen: true,
        isActive: true,
      },
    ]);

    const [spiceGarden, pizzaCorner, burgerHouse] = restaurants;

    await MenuItem.insertMany([
      // Spice Garden
      {
        restaurant: spiceGarden._id,
        name: "Paneer Butter Masala",
        description: "Paneer in a rich, creamy tomato gravy.",
        price: 249,
        category: "Main Course",
        isVegetarian: true,
      },
      {
        restaurant: spiceGarden._id,
        name: "Veg Biryani",
        description: "Fragrant rice with vegetables and spices.",
        price: 199,
        category: "Rice",
        isVegetarian: true,
      },

      // Pizza Corner
      {
        restaurant: pizzaCorner._id,
        name: "Margherita Pizza",
        description: "Classic pizza with tomato and mozzarella.",
        price: 229,
        category: "Pizza",
        isVegetarian: true,
      },
      {
        restaurant: pizzaCorner._id,
        name: "Farmhouse Pizza",
        description: "Pizza topped with vegetables and cheese.",
        price: 329,
        category: "Pizza",
        isVegetarian: true,
      },

      // Burger House
      {
        restaurant: burgerHouse._id,
        name: "Classic Veg Burger",
        description: "Crispy vegetable patty with lettuce and house sauce.",
        price: 129,
        category: "Burgers",
        isVegetarian: true,
      },
      {
        restaurant: burgerHouse._id,
        name: "Classic Chicken Burger",
        description: "Seasoned chicken patty with fresh vegetables.",
        price: 179,
        category: "Burgers",
        isVegetarian: false,
      },
      {
        restaurant: burgerHouse._id,
        name: "French Fries",
        description: "Golden, crispy salted fries.",
        price: 89,
        category: "Sides",
        isVegetarian: true,
      },
    ]);

    console.log("Sample restaurants and menu items added successfully");

    for (const restaurant of restaurants) {
      console.log(`${restaurant.name}: ${restaurant._id}`);
    }
  } catch (error) {
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedDatabase();
