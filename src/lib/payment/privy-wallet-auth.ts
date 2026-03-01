type WalletWithOptionalLoginOrLink = {
  loginOrLink?: unknown;
};

export async function ensurePrivyWalletAuthenticated(
  wallet: WalletWithOptionalLoginOrLink | null
): Promise<boolean> {
  if (!wallet || typeof wallet.loginOrLink !== "function") {
    return false;
  }

  await wallet.loginOrLink();
  return true;
}
