import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

/**
 * Utility to generate a deterministic burner wallet for testing the L402 flow
 * without requiring the user to connect a real Web3 wallet.
 */

// A fixed testing private key. In a real app this would never be hardcoded,
// but for a Hackathon MVP burner wallet to sign L402 payloads, this is sufficient.
const BURNER_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const account = privateKeyToAccount(BURNER_PRIVATE_KEY);

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
});

/**
 * Generates a mock X-PAYMENT signature that satisfies the Gateway MVP requirements.
 * Gateway MVP currently just checks if the header exists and forwards it.
 */
export async function generateMockPaymentSignature(params: {
  amount: string;
  asset: string;
}): Promise<{ headerName: string; value: string }> {
  // We'll create a simple signed payload to simulate a real payment token
  const message = `Payment authorization for ${params.amount} ${params.asset}. Timestamp: ${Date.now()}`;

  try {
    const signature = await walletClient.signMessage({
      message,
    });

    const validAfter = Math.floor(Date.now() / 1000) - 60;
    const validBefore = validAfter + 300;
    const nonce =
      "0x" +
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    const mockToken = Buffer.from(
      JSON.stringify({
        x402Version: 1,
        scheme: "exact",
        network: "base",
        payload: {
          signature,
          authorization: {
            from: account.address,
            to: "0x0000000000000000000000000000000000000000",
            value: params.amount,
            validAfter: validAfter.toString(),
            validBefore: validBefore.toString(),
            nonce,
          },
        },
      })
    ).toString("base64");

    return {
      headerName: "X-Payment",
      value: mockToken,
    };
  } catch (error) {
    console.error("Failed to generate mock signature:", error);
    // Fallback if viem signing fails in browser context
    return {
      headerName: "X-Payment",
      value: `mock-signature-${Date.now()}`,
    };
  }
}
