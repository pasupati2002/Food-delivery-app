import mongoose from "mongoose";

const restaurantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    description: {
      type: String,
      default: "",
      maxlength: 1000,
    },

    image: {
      type: String,
      default: "",
    },

    cuisine: {
      type: [String],
      default: [],
    },

    address: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },

    deliveryTime: {
      type: String,
      default: "30–45 min",
    },

    isOpen: {
      type: Boolean,
      default: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Restaurant = mongoose.model("Restaurant", restaurantSchema);

export default Restaurant;
