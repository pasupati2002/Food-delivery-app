import Restaurant from "../models/Restaurant.js";
import MenuItem from "../models/MenuItem.js";

// GET /api/restaurants
export async function getRestaurants(req, res) {
  try {
    const restaurants = await Restaurant.find({
      isActive: true,
    }).sort({ createdAt: -1 });

    return res.json({
      count: restaurants.length,
      restaurants,
    });
  } catch (error) {
    console.error("Get restaurants error:", error.message);

    return res.status(500).json({
      message: "Unable to fetch restaurants",
    });
  }
}

// GET /api/restaurants/:id
export async function getRestaurantById(req, res) {
  try {
    const restaurant = await Restaurant.findOne({
      _id: req.params.id,
      isActive: true,
    });

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    return res.json({ restaurant });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        message: "Invalid restaurant ID",
      });
    }

    console.error("Get restaurant error:", error.message);

    return res.status(500).json({
      message: "Unable to fetch restaurant",
    });
  }
}

// GET /api/restaurants/:id/menu
export async function getRestaurantMenu(req, res) {
  try {
    const restaurant = await Restaurant.findOne({
      _id: req.params.id,
      isActive: true,
    });

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    const menuItems = await MenuItem.find({
      restaurant: restaurant._id,
      isAvailable: true,
    }).sort({ category: 1, name: 1 });

    return res.json({
      restaurantId: restaurant._id,
      restaurantName: restaurant.name,
      count: menuItems.length,
      menuItems,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        message: "Invalid restaurant ID",
      });
    }

    console.error("Get menu error:", error.message);

    return res.status(500).json({
      message: "Unable to fetch menu",
    });
  }
}