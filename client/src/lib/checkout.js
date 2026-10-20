
import api from "./api";
import { loadRazorpayScript } from "./razorpay";

// Start checkout for a new order created from the customer's cart.
export async function startCheckout({
  cart,
  deliveryAddress,
  onSuccess,
  onError,
}) {
  try {
    if (
      typeof deliveryAddress !== "string" ||
      deliveryAddress.trim().length < 5 ||
      deliveryAddress.trim().length > 500
    ) {
      throw new Error("Please enter a valid delivery address.");
    }

    if (
      !cart?.restaurant ||
      !Array.isArray(cart.items) ||
      cart.items.length === 0
    ) {
      throw new Error(
        "Your cart is empty or missing its restaurant. Please return to your cart and try again."
      );
    }

    const items = cart.items.map((item) => ({
      menuItem: item.menuItemId,
      quantity: item.quantity,
    }));

    if (
      items.some(
        (item) =>
          typeof item.menuItem !== "string" ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > 50
      )
    ) {
      throw new Error(
        "Your cart contains invalid items. Please refresh your cart and try again."
      );
    }

    // 1. Load Razorpay Checkout.
    const loaded = await loadRazorpayScript();

    if (!loaded || !window.Razorpay) {
      throw new Error(
        "Unable to load Razorpay Checkout. Check your internet connection."
      );
    }

    // 2. Create the food order.
    // The backend calculates prices using the database.
    const orderResponse = await api.post("/orders", {
      restaurant: cart.restaurant,
      items,
      deliveryAddress: deliveryAddress.trim(),
    });

    const order = orderResponse.data.order;

    if (!order?._id) {
      throw new Error("The server did not return a valid order.");
    }

    // 3. Create the Razorpay payment order.
    const paymentResponse = await api.post(
      `/orders/${order._id}/payment`
    );

    const payment = paymentResponse.data.payment;

    if (
      !payment?.keyId ||
      !payment?.razorpayOrderId ||
      payment.currency !== "INR" ||
      !Number.isSafeInteger(payment.amount) ||
      payment.amount <= 0
    ) {
      throw new Error(
        "Invalid payment details received from the server."
      );
    }

    // 4. Open Razorpay Checkout.
    const checkout = new window.Razorpay({
      key: payment.keyId,
      amount: payment.amount,
      currency: payment.currency,
      name: "Food Delivery App",
      description: `Food order ${order._id}`,
      order_id: payment.razorpayOrderId,

      handler: async function (response) {
        try {
          // 5. Verify the payment on the backend.
          const verificationResponse = await api.post(
            `/orders/${order._id}/verify-payment`,
            {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }
          );

          if (
            verificationResponse.data.paymentStatus !== "paid"
          ) {
            throw new Error("Payment has not been confirmed.");
          }

          if (onSuccess) {
            await onSuccess({
              ...verificationResponse.data,
              orderId:
                verificationResponse.data.orderId || order._id,
            });
          }
        } catch (error) {
          if (onError) {
            onError(
              error.response?.data?.message ||
                error.message ||
                "Payment verification failed."
            );
          }
        }
      },

      modal: {
        ondismiss: function () {
          if (onError) {
            onError(
              "Checkout was closed. Your order remains unpaid; you can retry payment from your orders."
            );
          }
        },
      },

      theme: {
        color: "#ea580c",
      },
    });

    checkout.on("payment.failed", function (response) {
      if (onError) {
        onError(
          response.error?.description ||
            "Payment failed. Please try again."
        );
      }
    });

    checkout.open();

    return order;
  } catch (error) {
    const message =
      error.response?.data?.message ||
      error.message ||
      "Unable to start checkout.";

    if (onError) {
      onError(message);
    }

    throw error;
  }
}

// Retry payment for an existing unpaid order.
export async function retryOrderPayment({
  order,
  onSuccess,
  onError,
}) {
  try {
    if (!order?._id) {
      throw new Error("Invalid order. Please refresh your orders.");
    }

    if (
      order.status === "cancelled" ||
      order.status === "delivered"
    ) {
      throw new Error("This order cannot be paid.");
    }

    if (order.paymentStatus === "paid") {
      throw new Error("This order has already been paid.");
    }

    if (
      !["pending", "confirmed"].includes(order.status) ||
      order.paymentStatus !== "pending"
    ) {
      throw new Error("This order is not eligible for payment.");
    }

    // 1. Load Razorpay Checkout.
    const loaded = await loadRazorpayScript();

    if (!loaded || !window.Razorpay) {
      throw new Error(
        "Unable to load Razorpay Checkout. Check your internet connection."
      );
    }

    // 2. Reuse the existing food order.
    // Do not create a second food order.
    const paymentResponse = await api.post(
      `/orders/${order._id}/payment`
    );

    const payment = paymentResponse.data.payment;

    if (
      !payment?.keyId ||
      !payment?.razorpayOrderId ||
      payment.currency !== "INR" ||
      !Number.isSafeInteger(payment.amount) ||
      payment.amount <= 0
    ) {
      throw new Error(
        "Invalid payment details received from the server."
      );
    }

    // 3. Open Razorpay Checkout for the existing order.
    const checkout = new window.Razorpay({
      key: payment.keyId,
      amount: payment.amount,
      currency: payment.currency,
      name: "Food Delivery App",
      description: `Payment for order ${order._id}`,
      order_id: payment.razorpayOrderId,

      handler: async function (response) {
        try {
          // 4. Verify payment on the backend.
          const verificationResponse = await api.post(
            `/orders/${order._id}/verify-payment`,
            {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }
          );

          if (
            verificationResponse.data.paymentStatus !== "paid"
          ) {
            throw new Error("Payment has not been confirmed.");
          }

          if (onSuccess) {
            await onSuccess({
              ...verificationResponse.data,
              orderId:
                verificationResponse.data.orderId || order._id,
            });
          }
        } catch (error) {
          if (onError) {
            onError(
              error.response?.data?.message ||
                error.message ||
                "Payment verification failed."
            );
          }
        }
      },

      modal: {
        ondismiss: function () {
          if (onError) {
            onError(
              "Checkout was closed. Your order remains unpaid."
            );
          }
        },
      },

      theme: {
        color: "#ea580c",
      },
    });

    checkout.on("payment.failed", function (response) {
      if (onError) {
        onError(
          response.error?.description ||
            "Payment failed. Please try again."
        );
      }
    });

    checkout.open();
  } catch (error) {
    const message =
      error.response?.data?.message ||
      error.message ||
      "Unable to retry payment.";

    if (onError) {
      onError(message);
    }
  }
}
