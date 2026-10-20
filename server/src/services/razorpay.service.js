import Razorpay from "razorpay";

let razorpayClient;

export function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (
    !keyId ||
    !keySecret ||
    !keyId.startsWith("rzp_test_") ||
    keySecret === "placeholder" ||
    keySecret === "your_test_key_secret"
  ) {
    throw new Error(
      "Valid Razorpay Test Mode API keys are required"
    );
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  return razorpayClient;
}